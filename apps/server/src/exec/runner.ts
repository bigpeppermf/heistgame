import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BALANCE, type Comparison, type Language, type TestCase, type TestResult,
} from '@heist/shared';
import { compare } from './compare.js';
import { JS_HARNESS, PY_HARNESS, SENTINEL } from './harnesses.js';

export type ExecOpts = {
  language: Language;
  code: string;
  functionName: string;
  tests: TestCase[];
  comparison: Comparison;
  /** Overridable so tests need not wait the full production timeout. */
  timeoutMs?: number;
};

export type ExecOutcome = {
  results: TestResult[];
  stdout: string;
  stderr: string;
  timedOut: boolean;
  passed: number;
};

// Protects the server from its own developers hammering Run.
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= BALANCE.EXEC_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export async function execute(
  opts: ExecOpts,
  onResult?: (r: TestResult) => void,
): Promise<ExecOutcome> {
  return withSlot(() => runOnce(opts, onResult));
}

async function runOnce(
  opts: ExecOpts,
  onResult?: (r: TestResult) => void,
): Promise<ExecOutcome> {
  const dir = await mkdtemp(join(tmpdir(), 'hc-'));
  try {
    const isPy = opts.language === 'python';
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({
        functionName: opts.functionName,
        tests: opts.tests.map((t) => ({ input: t.input })),
      }),
    );

    if (isPy) {
      await writeFile(join(dir, 'solution.py'), opts.code);
      await writeFile(join(dir, 'harness.py'), PY_HARNESS);
    } else {
      // The temp dir has no package.json of its own, so pin CommonJS explicitly.
      await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
      await writeFile(
        join(dir, 'solution.js'),
        `${opts.code}\nmodule.exports = (typeof ${opts.functionName} !== 'undefined') ? ${opts.functionName} : undefined;\n`,
      );
      await writeFile(join(dir, 'harness.js'), JS_HARNESS);
    }

    const child = spawn(
      isPy ? 'python3' : process.execPath,
      [isPy ? 'harness.py' : 'harness.js'],
      {
        cwd: dir,
        // SCRUBBED. Never inherit process.env — see spec section 7.
        env: { PATH: process.env.PATH ?? '' },
        timeout: opts.timeoutMs ?? BALANCE.EXEC_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      },
    );

    const results: TestResult[] = [];
    let buffer = '';
    let stdout = '';
    const seen = new Set<number>();
    let stderr = '';
    let bytes = 0;
    let capped = false;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += chunk.length;
      if (bytes > BALANCE.EXEC_OUTPUT_CAP_BYTES) {
        capped = true;
        child.kill('SIGKILL');
        return;
      }
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        // Anything unprefixed is anomalous: the harness captures the
        // submission's own output and reports it via a protocol line.
        if (!line.startsWith(SENTINEL)) continue;
        try {
          const raw = JSON.parse(line.slice(SENTINEL.length)) as {
            i?: unknown; ms?: unknown; actual?: unknown; error?: string | null; stdout?: unknown;
          };
          if (typeof raw.stdout === 'string' && raw.i === undefined) {
            stdout = raw.stdout;
            continue;
          }
          const i = raw.i;
          if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= opts.tests.length) continue;
          if (seen.has(i)) continue;
          seen.add(i);
          const ms = typeof raw.ms === 'number' && Number.isFinite(raw.ms) ? raw.ms : 0;
          const expected = opts.tests[i]?.expected;
          const result: TestResult = {
            i,
            pass: raw.error ? false : compare(raw.actual, expected, opts.comparison),
            ms,
            actual: raw.actual,
            ...(raw.error ? { error: raw.error } : {}),
          };
          results.push(result);
          onResult?.(result);
        } catch {
          // A malformed protocol line is ignored; the missing index is
          // backfilled as a timeout below.
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });

    const killed = await new Promise<boolean>((resolve) => {
      child.on('close', (_code, signal) => resolve(signal === 'SIGKILL'));
      child.on('error', () => resolve(false));
    });

    // Backfill anything that never reported: hung, killed, or crashed mid-run.
    for (let i = 0; i < opts.tests.length; i += 1) {
      if (!results.some((r) => r.i === i)) {
        results.push({ i, pass: false, ms: 0, error: 'timeout' });
      }
    }
    results.sort((a, b) => a.i - b.i);

    return {
      results,
      stdout: capped ? `${stdout}\n[output truncated]` : stdout,
      stderr,
      timedOut: killed,
      passed: results.filter((r) => r.pass).length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
