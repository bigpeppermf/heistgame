import { describe, expect, it } from 'vitest';
import { execute } from './runner.js';
import type { TestCase } from '@heist/shared';

const TESTS: TestCase[] = [
  { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { input: [[3, 2, 4], 6], expected: [1, 2] },
];

const PY_GOOD = `def crack_vault(codes, target):
    seen = {}
    for i, c in enumerate(codes):
        if target - c in seen:
            return [seen[target - c], i]
        seen[c] = i
    return []
`;

const JS_GOOD = `function crackVault(codes, target) {
  const seen = new Map();
  for (let i = 0; i < codes.length; i++) {
    if (seen.has(target - codes[i])) return [seen.get(target - codes[i]), i];
    seen.set(codes[i], i);
  }
  return [];
}
`;

describe('execute — python', () => {
  it('passes a correct solution and reports the pass count', async () => {
    const out = await execute({
      language: 'python', code: PY_GOOD, functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(2);
    expect(out.results.map((r) => r.pass)).toEqual([true, true]);
    expect(out.timedOut).toBe(false);
  });

  it('REVIEW FOCUS 1: a syntax error fails every test, surfaces stderr, and still resolves', async () => {
    const out = await execute({
      language: 'python', code: 'def crack_vault(codes, target)\n    return [', functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(0);
    expect(out.results).toHaveLength(2);
    expect(out.results.every((r) => r.pass === false)).toBe(true);
    expect(out.stderr).toMatch(/SyntaxError/);
  });

  it('fails only the test that raises, keeping credit for the others', async () => {
    const code = `def crack_vault(codes, target):
    if target == 6:
        raise ValueError("boom")
    return [0, 1]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.results[0]!.pass).toBe(true);
    expect(out.results[1]!.pass).toBe(false);
    expect(out.results[1]!.error).toMatch(/ValueError/);
    expect(out.passed).toBe(1);
  });

  it('reports a missing function as a load error rather than hanging', async () => {
    const out = await execute({
      language: 'python', code: 'def wrong_name(a, b):\n    return []', functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(0);
    expect(out.stderr).toMatch(/AttributeError|has no attribute/);
  });

  it('captures the player own stdout separately from the protocol', async () => {
    const code = `def crack_vault(codes, target):
    print("debugging the vault")
    return [0, 1]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: [TESTS[0]!], comparison: 'unordered',
    });
    expect(out.stdout).toContain('debugging the vault');
    expect(out.stdout).not.toContain('##HC##');
    expect(out.results[0]!.pass).toBe(true);
  });

  it('keeps partial credit when the code hangs, marking the rest as timeout', async () => {
    const code = `def crack_vault(codes, target):
    if target == 6:
        while True:
            pass
    return [0, 1]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered', timeoutMs: 1500,
    });
    expect(out.timedOut).toBe(true);
    expect(out.results[0]!.pass).toBe(true);
    expect(out.results[1]!.error).toBe('timeout');
    expect(out.passed).toBe(1);
  }, 10_000);

  it('cannot read the parent environment', async () => {
    process.env.HC_SECRET_CANARY = 'do-not-leak';
    const code = `import os
def crack_vault(codes, target):
    return [os.environ.get("HC_SECRET_CANARY", "ABSENT")]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: [{ input: [[1], 1], expected: ['ABSENT'] }], comparison: 'exact',
    });
    delete process.env.HC_SECRET_CANARY;
    expect(out.results[0]!.pass).toBe(true);
  });
});

describe('execute — javascript', () => {
  it('passes a correct solution', async () => {
    const out = await execute({
      language: 'javascript', code: JS_GOOD, functionName: 'crackVault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(2);
  });

  it('reports a syntax error through stderr', async () => {
    const out = await execute({
      language: 'javascript', code: 'function crackVault(a, b) { return [', functionName: 'crackVault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(0);
    expect(out.stderr.length).toBeGreaterThan(0);
  });
});
