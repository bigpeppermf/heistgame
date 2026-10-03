type Role = 'COP' | 'ROBBER';
type Phase = 'LOBBY' | 'ROLE_REVEAL' | 'ROUND_INTRO' | 'CODING' | 'JUDGING'
           | 'SCORING' | 'POWERUP' | 'MOVEMENT' | 'GAME_OVER';
type PowerupType = 'EMP' | 'BLACKOUT' | 'JAMMED_COMMS' | 'SMOKE_BOMB'
                 | 'ROADBLOCK' | 'GETAWAY_CAR' | 'SHIELD';
type ActiveEffect = { type: PowerupType; expiresAt: number };

type PlayerView = {
  id: string; nickname: string; role: Role; position: number;
  inventory: PowerupType[]; shielded: boolean; activeEffects: ActiveEffect[];
  submitted: boolean; connected: boolean; progress: number | null;
};

type RoundScore = {
  correctness: number; style: number; total: number; baseTiles: number;
  modifierDelta: number; speedBonus: number; tiles: number;
  passed: number; totalTests: number; note: string;
};

export type { Role, Phase, PowerupType, ActiveEffect, PlayerView, RoundScore };
