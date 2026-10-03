'use client';

import type { TestResult } from '@heist/shared';

type Props = {
  results: TestResult[];
  stdout: string;
  stderr: string;
};

/** Plain results list. The jammed state is composed over it by the page. */
export function TestResults({ results, stdout, stderr }: Props) {
  return (
    <div className="h-full overflow-auto p-4 text-sm">
      <h3 className="game-eyebrow">Test feed {results.length > 0 && ` / ${results.filter(result => result.pass).length} of ${results.length} passed`}</h3>
      {stderr && (
        <pre className="mb-3 whitespace-pre-wrap" style={{ color: 'var(--hc-robber)' }}>{stderr}</pre>
      )}

      {results.map((r) => (
        <div key={r.i} className="game-test-row flex items-baseline gap-2">
          <span style={{ color: r.pass ? 'var(--hc-gold)' : 'var(--hc-robber)' }}>
            {r.pass ? 'PASS' : 'FAIL'}
          </span>
          <span style={{ color: 'var(--hc-dim)' }}>case {r.i + 1}</span>
          {!r.pass && (
            <span style={{ color: 'var(--hc-dim)' }}>
              got {JSON.stringify(r.actual)}{r.error ? ` (${r.error})` : ''}
            </span>
          )}
        </div>
      ))}

      {stdout.trim() && (
        <>
          <p className="mt-3" style={{ color: 'var(--hc-dim)' }}>your output</p>
          <pre className="whitespace-pre-wrap">{stdout}</pre>
        </>
      )}

      {results.length === 0 && !stderr && (
        <p style={{ color: 'var(--hc-dim)' }}>Run your code against the sample cases.</p>
      )}
    </div>
  );
}
