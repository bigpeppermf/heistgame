import { describe, expect, it } from 'vitest';
import { PROBLEMS } from './problems.js';
import { toPublicProblem } from './state.js';

describe('role-specific problem briefings', () => {
  it.each(PROBLEMS.map(problem => [problem.id, problem] as const))('%s gives both sides the same coding contract without private data', (_id, problem) => {
    const cops = toPublicProblem(problem, 'COP');
    const crew = toPublicProblem(problem, 'ROBBER');
    expect(cops.title).not.toBe(crew.title);
    expect(cops.narrative).not.toBe(crew.narrative);
    expect(cops.narrative).toContain(problem.narrative);
    expect(crew.narrative).toContain(problem.narrative);
    const { title: _copTitle, narrative: _copNarrative, ...copContract } = cops;
    const { title: _crewTitle, narrative: _crewNarrative, ...crewContract } = crew;
    expect(copContract).toEqual(crewContract);
    for (const view of [cops, crew, toPublicProblem(problem)]) {
      expect(view).not.toHaveProperty('hiddenTests');
      expect(view).not.toHaveProperty('roleBriefings');
    }
    expect(toPublicProblem(problem).title).toBe(problem.title);
  });
});
