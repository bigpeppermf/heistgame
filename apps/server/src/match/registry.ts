import { randomInt } from 'node:crypto';
import { MatchEngine, type EngineDeps } from './engine.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1

function randomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export type RegistryDeps = EngineDeps;

export class MatchRegistry {
  private matches = new Map<string, MatchEngine>();

  constructor(private readonly deps: RegistryDeps) {}

  get size(): number {
    return this.matches.size;
  }

  create(nickname: string, demo = false): { roomCode: string; playerId: string } {
    let roomCode = randomCode();
    while (this.matches.has(roomCode)) roomCode = randomCode();

    const engine = new MatchEngine(roomCode, this.deps, demo);
    this.matches.set(roomCode, engine);

    const joined = engine.addPlayer(nickname);
    if (!joined.ok) throw new Error('fresh match rejected its first player');
    return { roomCode, playerId: joined.data.playerId };
  }

  get(roomCode: string): MatchEngine | undefined {
    return this.matches.get(roomCode.toUpperCase());
  }

  async tickAll(now: number): Promise<void> {
    await Promise.all([...this.matches.values()].map((m) => m.tick(now)));
  }

  sweep(now: number): void {
    for (const [code, match] of this.matches) {
      if (match.isEmpty(now)) this.matches.delete(code);
    }
  }
}
