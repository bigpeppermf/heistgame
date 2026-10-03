import { GoogleGenAI } from '@google/genai';
import { BALANCE, type Language, type RubricScore } from '@heist/shared';

export const RUBRIC_MAX = {
  naming: 5,
  readability: 5,
  comments: 4,
  organization: 3,
  simplicity: 3,
} as const;

/** Sums to exactly 14, per spec section 6 case 7. */
export const FALLBACK_RUBRIC: RubricScore = {
  naming: 4,
  readability: 4,
  comments: 3,
  organization: 2,
  simplicity: 1,
  note: 'Style review unavailable for this submission.',
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    naming: { type: 'integer' },
    readability: { type: 'integer' },
    comments: { type: 'integer' },
    organization: { type: 'integer' },
    simplicity: { type: 'integer' },
    note: { type: 'string' },
  },
  required: ['naming', 'readability', 'comments', 'organization', 'simplicity', 'note'],
} as const;

function prompt(code: string, language: Language): string {
  return `You are a code STYLE reviewer for a competitive coding game.
Score the ${language} submission below against this fixed rubric. Award integers only.

- naming (0-5): descriptive identifiers, not x, a, tmp
- readability (0-5): understandable flow and structure
- comments (0-4): helpful where needed; do NOT reward volume
- organization (0-3): sensible functions, separated logic
- simplicity (0-3): avoids needless complexity or duplicated work

Do NOT judge whether the code is correct. Test cases decide that. Score style only.
Add a one-sentence "note" in the voice of a veteran heist crew boss.

SUBMISSION:
${code}`;
}

function clampField(v: unknown, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function normalizeRubric(raw: unknown): RubricScore {
  const o: Record<string, unknown> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    naming: clampField(o.naming, RUBRIC_MAX.naming),
    readability: clampField(o.readability, RUBRIC_MAX.readability),
    comments: clampField(o.comments, RUBRIC_MAX.comments),
    organization: clampField(o.organization, RUBRIC_MAX.organization),
    simplicity: clampField(o.simplicity, RUBRIC_MAX.simplicity),
    note: typeof o.note === 'string' ? o.note.slice(0, 200) : '',
  };
}

let client: GoogleGenAI | null = null;

async function liveCall(text: string): Promise<string> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
  const res = await client.models.generateContent({
    model: BALANCE.GEMINI_MODEL,
    contents: text,
    config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });
  return res.text ?? '';
}

function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m?.[1] ?? s).trim();
}

/**
 * Never throws and never hangs. On any failure the round still resolves
 * with a fixed fallback, per spec section 6 case 7.
 */
export async function judgeStyle(
  code: string,
  language: Language,
  call: (text: string) => Promise<string> = liveCall,
): Promise<RubricScore> {
  if (process.env.DEV_SKIP_AI === '1') return FALLBACK_RUBRIC;

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('gemini timeout')), BALANCE.GEMINI_TIMEOUT_MS);
  });

  try {
    const text = await Promise.race([call(prompt(code, language)), timeout]);
    return normalizeRubric(JSON.parse(stripFence(text)));
  } catch {
    return FALLBACK_RUBRIC;
  }
}
