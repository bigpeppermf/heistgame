import { describe, expect, it } from 'vitest';
import { BALANCE, PROBLEMS, problemForRound, type Language } from '@heist/shared';
import { execute } from './runner.js';

/** Reference solutions, keyed by problem id. Never shipped to clients. */
const REFERENCE: Record<string, Record<Language, string>> = {
  'vault-codes': {
    python: `def crack_vault(codes, target):
    seen = {}
    for i, code in enumerate(codes):
        if target - code in seen:
            return [seen[target - code], i]
        seen[code] = i
    return []
`,
    javascript: `function crackVault(codes, target) {
  const seen = new Map();
  for (let i = 0; i < codes.length; i++) {
    if (seen.has(target - codes[i])) return [seen.get(target - codes[i]), i];
    seen.set(codes[i], i);
  }
  return [];
}
`,
  },
  'laser-grid': {
    python: `def disarm(grid):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in grid:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
`,
    javascript: `function disarm(grid) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of grid) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (pairs[ch]) { if (stack.pop() !== pairs[ch]) return false; }
  }
  return stack.length === 0;
}
`,
  },
  'getaway-route': {
    python: `def count_routes(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b
`,
    javascript: `function countRoutes(n) {
  let a = 1, b = 1;
  for (let i = 0; i < n - 1; i++) { const next = a + b; a = b; b = next; }
  return b;
}
`,
  },
  'inside-job': {
    python: `def best_window(coverage):
    best = 0
    low = None
    for value in coverage:
        if low is None or value < low:
            low = value
        elif value - low > best:
            best = value - low
    return best
`,
    javascript: `function bestWindow(coverage) {
  let best = 0;
  let low = Infinity;
  for (const value of coverage) {
    if (value < low) low = value;
    else if (value - low > best) best = value - low;
  }
  return best;
}
`,
  },
};

describe('problem set shape', () => {
  it('has one problem per round plus a spare', () => {
    expect(PROBLEMS).toHaveLength(BALANCE.TOTAL_ROUNDS + 1);
  });

  it('gives every round a problem', () => {
    for (let r = 1; r <= BALANCE.TOTAL_ROUNDS; r += 1) {
      expect(problemForRound(r).id).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
  });

  it('gives every problem at least 8 hidden tests and 2 samples', () => {
    for (const p of PROBLEMS) {
      expect(p.hiddenTests.length).toBeGreaterThanOrEqual(8);
      expect(p.sampleTests.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('has starter code that names the function for both languages', () => {
    for (const p of PROBLEMS) {
      expect(p.starterCode.python).toContain(p.functionName.python);
      expect(p.starterCode.javascript).toContain(p.functionName.javascript);
    }
  });
});

describe('every expected value is correct', () => {
  for (const problem of PROBLEMS) {
    for (const language of ['python', 'javascript'] as Language[]) {
      it(`${problem.id} / ${language}: reference solution passes all tests`, async () => {
        const out = await execute({
          language,
          code: REFERENCE[problem.id]![language],
          functionName: problem.functionName[language],
          tests: [...problem.sampleTests, ...problem.hiddenTests],
          comparison: problem.comparison,
        });
        const failures = out.results
          .filter((r) => !r.pass)
          .map((r) => `#${r.i} got ${JSON.stringify(r.actual)} err=${r.error ?? 'none'}`);
        expect(failures, failures.join('; ')).toEqual([]);
      }, 20_000);
    }
  }
});
