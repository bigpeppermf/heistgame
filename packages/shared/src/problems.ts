import type { Problem } from './state.js';

export const PROBLEMS: Problem[] = [
  {
    id: 'vault-codes',
    title: 'Match the Vault Codes',
    narrative:
      'The vault override needs exactly two keycards whose codes add up to the target value. ' +
      'Return the positions of the two cards. Exactly one pair works.',
    functionName: { python: 'crack_vault', javascript: 'crackVault' },
    starterCode: {
      python: 'def crack_vault(codes, target):\n    # codes: list[int], target: int\n    # return the two positions as a list, e.g. [0, 1]\n    pass\n',
      javascript: 'function crackVault(codes, target) {\n  // codes: number[], target: number\n  // return the two positions as an array, e.g. [0, 1]\n}\n',
    },
    comparison: 'unordered',
    sampleTests: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { input: [[3, 2, 4], 6], expected: [1, 2] },
    ],
    hiddenTests: [
      { input: [[3, 3], 6], expected: [0, 1] },
      { input: [[-1, -2, -3, -4, -5], -8], expected: [2, 4] },
      { input: [[0, 4, 3, 0], 0], expected: [0, 3] },
      { input: [[1, 5, 9, 13], 22], expected: [2, 3] },
      { input: [[-3, 4, 3, 90], 0], expected: [0, 2] },
      { input: [[2, 5, 5, 11], 10], expected: [1, 2] },
      { input: [[1, 2], 3], expected: [0, 1] },
      { input: [[10, 20, 30, 40, 50], 90], expected: [3, 4] },
    ],
  },
  {
    id: 'laser-grid',
    title: 'Disarm the Laser Grid',
    narrative:
      'The grid controller accepts a string of brackets. It disarms only if every bracket is ' +
      'closed by the matching type, in the right order. Return true if the sequence disarms it.',
    functionName: { python: 'disarm', javascript: 'disarm' },
    starterCode: {
      python: 'def disarm(grid):\n    # grid: str of ()[]{}\n    # return True or False\n    pass\n',
      javascript: 'function disarm(grid) {\n  // grid: string of ()[]{}\n  // return true or false\n}\n',
    },
    comparison: 'exact',
    sampleTests: [
      { input: ['()'], expected: true },
      { input: ['(]'], expected: false },
    ],
    hiddenTests: [
      { input: ['()[]{}'], expected: true },
      { input: ['([)]'], expected: false },
      { input: ['{[]}'], expected: true },
      { input: [''], expected: true },
      { input: ['('], expected: false },
      { input: [')'], expected: false },
      { input: ['(((('], expected: false },
      { input: ['{[()]}'], expected: true },
      { input: [']'], expected: false },
      { input: ['([{}])()'], expected: true },
    ],
  },
  {
    id: 'getaway-route',
    title: 'Trace the Getaway Route',
    narrative:
      'The alley has n checkpoints. From any checkpoint the driver can jump ahead one or two. ' +
      'Count the distinct routes that reach checkpoint n exactly.',
    functionName: { python: 'count_routes', javascript: 'countRoutes' },
    starterCode: {
      python: 'def count_routes(n):\n    # n: int, number of checkpoints\n    # return the number of distinct routes\n    pass\n',
      javascript: 'function countRoutes(n) {\n  // n: number of checkpoints\n  // return the number of distinct routes\n}\n',
    },
    comparison: 'exact',
    sampleTests: [
      { input: [2], expected: 2 },
      { input: [3], expected: 3 },
    ],
    hiddenTests: [
      { input: [1], expected: 1 },
      { input: [4], expected: 5 },
      { input: [5], expected: 8 },
      { input: [10], expected: 89 },
      { input: [20], expected: 10946 },
      { input: [30], expected: 1346269 },
      { input: [40], expected: 165580141 },
      { input: [45], expected: 1836311903 },
    ],
  },
  {
    id: 'inside-job',
    title: 'Buy Low, Fence High',
    narrative:
      'A fence quotes a price for the take every hour. Hand the goods over to him at one hour and ' +
      'collect payment at a later hour. Return the largest profit you can make, or 0 if the price never rises.',
    functionName: { python: 'best_window', javascript: 'bestWindow' },
    starterCode: {
      python: 'def best_window(coverage):\n    # coverage: list[int] of the fence price each hour\n    # return the largest later-minus-earlier profit, or 0\n    pass\n',
      javascript: 'function bestWindow(coverage) {\n  // coverage: number[] of the fence price each hour\n  // return the largest later-minus-earlier profit, or 0\n}\n',
    },
    comparison: 'exact',
    sampleTests: [
      { input: [[7, 1, 5, 3, 6, 4]], expected: 5 },
      { input: [[7, 6, 4, 3, 1]], expected: 0 },
    ],
    hiddenTests: [
      { input: [[1, 2]], expected: 1 },
      { input: [[2, 1]], expected: 0 },
      { input: [[1]], expected: 0 },
      { input: [[]], expected: 0 },
      { input: [[3, 3, 3]], expected: 0 },
      { input: [[2, 4, 1]], expected: 2 },
      { input: [[1, 2, 3, 4, 5]], expected: 4 },
      { input: [[5, 1, 6, 2, 8]], expected: 7 },
    ],
  },
];

/** Rounds are 1-indexed. The fourth problem is the spare. */
export function problemForRound(round: number): Problem {
  const p = PROBLEMS[round - 1];
  if (!p) throw new Error(`no problem for round ${round}`);
  return p;
}
