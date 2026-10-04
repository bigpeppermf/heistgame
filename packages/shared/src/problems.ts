import type { Problem } from './state.js';

export const PROBLEMS: Problem[] = [
  {
    id: 'vault-codes',
    title: 'Match the Vault Codes',
    narrative:
      'Given a list of integer codes and a target, return the zero-based indices of two distinct entries whose values add up to the target. ' +
      'Exactly one pair exists. Return the indices in either order; you cannot use the same entry twice.',
    roleBriefings: {
      COP: { title: 'Identify the Compromised Keycards', narrative: 'The Cops intercepted a vault override target. Find the two keycards the Heist Crew used so you can trace the breach.' },
      ROBBER: { title: 'Match the Vault Codes', narrative: 'The Heist Crew has the keycards, but the vault needs a two-card override. Find the right pair to get inside before the Cops arrive.' },
    },
    functionName: { python: 'crack_vault', javascript: 'crackVault' },
    starterCode: {
      python: 'def crack_vault(codes, target):\n    # codes: list[int], target: int\n    # return the two positions as a list, e.g. [0, 1]\n    pass\n',
      javascript: 'function crackVault(codes, target) {\n  // codes: number[], target: number\n  // return the two positions as an array, e.g. [0, 1]\n}\n',
    },
    solution: {
      python: 'def crack_vault(codes, target):\n    """Return the indices of the two codes that sum to the target."""\n    index_by_value = {}\n    for index, code in enumerate(codes):\n        complement = target - code\n        if complement in index_by_value:\n            return [index_by_value[complement], index]\n        index_by_value[code] = index\n    return []\n',
      javascript: 'function crackVault(codes, target) {\n  // Return the indices of the two codes that sum to the target.\n  const indexByValue = new Map();\n  for (let index = 0; index < codes.length; index += 1) {\n    const complement = target - codes[index];\n    if (indexByValue.has(complement)) return [indexByValue.get(complement), index];\n    indexByValue.set(codes[index], index);\n  }\n  return [];\n}\n',
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
      'Given a string containing only ()[]{}, return true if each opening bracket is closed by the matching type in the correct nesting order; otherwise return false. ' +
      'Every bracket must be matched. The empty string is valid.',
    roleBriefings: {
      COP: { title: 'Verify the Security Signal', narrative: 'The Cops recovered a bracket-encoded security signal from the vault. Check whether it is valid before using it to track the Heist Crew.' },
      ROBBER: { title: 'Disarm the Laser Grid', narrative: 'The Heist Crew must send a valid bracket sequence to disarm the lasers. Check the sequence before sending it to the controller.' },
    },
    functionName: { python: 'disarm', javascript: 'disarm' },
    starterCode: {
      python: 'def disarm(grid):\n    # grid: str of ()[]{}\n    # return True or False\n    pass\n',
      javascript: 'function disarm(grid) {\n  // grid: string of ()[]{}\n  // return true or false\n}\n',
    },
    solution: {
      python: 'def disarm(grid):\n    """Return True when every bracket closes in the correct order."""\n    opening_for = {\')\': \'(\', \']\': \'[\', \'}\': \'{\'}\n    open_brackets = []\n    for symbol in grid:\n        if symbol in opening_for:\n            if not open_brackets or open_brackets.pop() != opening_for[symbol]:\n                return False\n        else:\n            open_brackets.append(symbol)\n    return not open_brackets\n',
      javascript: 'function disarm(grid) {\n  // True when every bracket closes in the correct order.\n  const openingFor = { \')\': \'(\', \']\': \'[\', \'}\': \'{\' };\n  const openBrackets = [];\n  for (const symbol of grid) {\n    if (openingFor[symbol]) {\n      if (openBrackets.pop() !== openingFor[symbol]) return false;\n    } else {\n      openBrackets.push(symbol);\n    }\n  }\n  return openBrackets.length === 0;\n}\n',
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
      'Start at checkpoint 0 on a route with n checkpoints, where n is a positive integer. Each move advances exactly one or two checkpoints. ' +
      'Return the number of distinct sequences of moves that reach checkpoint n exactly. Different orders count as different routes.',
    roleBriefings: {
      COP: { title: 'Map the Pursuit Routes', narrative: 'The Cops are tracking the getaway through an alley. Count every possible route to the final checkpoint so the team can cover the exits.' },
      ROBBER: { title: 'Plan the Getaway Routes', narrative: 'The Heist Crew needs options if the Cops block an alley. Count every possible route to the final checkpoint for the getaway driver.' },
    },
    functionName: { python: 'count_routes', javascript: 'countRoutes' },
    starterCode: {
      python: 'def count_routes(n):\n    # n: int, number of checkpoints\n    # return the number of distinct routes\n    pass\n',
      javascript: 'function countRoutes(n) {\n  // n: number of checkpoints\n  // return the number of distinct routes\n}\n',
    },
    solution: {
      python: 'def count_routes(n):\n    """Count the distinct one- or two-step routes landing exactly on n."""\n    routes_to_previous, routes_to_current = 1, 1\n    for _ in range(n - 1):\n        routes_to_previous, routes_to_current = (\n            routes_to_current, routes_to_previous + routes_to_current\n        )\n    return routes_to_current\n',
      javascript: 'function countRoutes(n) {\n  // Count the distinct one- or two-step routes landing exactly on n.\n  let routesToPrevious = 1;\n  let routesToCurrent = 1;\n  for (let step = 1; step < n; step += 1) {\n    const next = routesToPrevious + routesToCurrent;\n    routesToPrevious = routesToCurrent;\n    routesToCurrent = next;\n  }\n  return routesToCurrent;\n}\n',
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
      'Given a list of hourly values, choose one earlier hour and one strictly later hour. Return the largest later value minus earlier value. ' +
      'Return 0 if no positive increase exists or there are fewer than two values.',
    roleBriefings: {
      COP: { title: 'Find the Surveillance Window', narrative: 'The Cops have hourly surveillance coverage readings. Find the largest increase from an earlier hour to a later hour to identify the strongest improvement in coverage.' },
      ROBBER: { title: 'Buy Low, Fence High', narrative: 'The Heist Crew has hourly prices from a fence. Choose an earlier hour to buy and a later hour to sell the take for the greatest profit.' },
    },
    functionName: { python: 'best_window', javascript: 'bestWindow' },
    starterCode: {
      python: 'def best_window(coverage):\n    # coverage: list[int] of hourly values\n    # return the largest later-minus-earlier increase, or 0\n    pass\n',
      javascript: 'function bestWindow(coverage) {\n  // coverage: number[] of hourly values\n  // return the largest later-minus-earlier increase, or 0\n}\n',
    },
    solution: {
      python: 'def best_window(coverage):\n    """Return the largest later-minus-earlier increase, or 0 if none."""\n    best_increase = 0\n    lowest_so_far = None\n    for value in coverage:\n        if lowest_so_far is None or value < lowest_so_far:\n            lowest_so_far = value\n        else:\n            best_increase = max(best_increase, value - lowest_so_far)\n    return best_increase\n',
      javascript: 'function bestWindow(coverage) {\n  // Largest later-minus-earlier increase, or 0 when there is none.\n  let bestIncrease = 0;\n  let lowestSoFar = Infinity;\n  for (const value of coverage) {\n    if (value < lowestSoFar) lowestSoFar = value;\n    else bestIncrease = Math.max(bestIncrease, value - lowestSoFar);\n  }\n  return bestIncrease;\n}\n',
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

/**
 * Rounds are 1-indexed and unbounded, so the list cycles: round 5 reuses the
 * first problem. Repeating beats running out mid-match.
 */
export function problemForRound(round: number): Problem {
  const p = PROBLEMS[(round - 1) % PROBLEMS.length];
  if (!p) throw new Error(`no problem for round ${round}`);
  return p;
}
