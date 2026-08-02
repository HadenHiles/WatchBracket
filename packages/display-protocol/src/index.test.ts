import { describe, expect, it } from 'vitest';
import { CastLaunchEnvelopeSchema, DisplaySceneSchema } from './index.js';

describe('Cast launch protocol', () => {
  it('accepts only the versioned opaque launch envelope', () => {
    expect(CastLaunchEnvelopeSchema.safeParse({ type: 'WATCH_BRACKET_LAUNCH', schemaVersion: 1, launchToken: 'a'.repeat(43) }).success).toBe(true);
    expect(CastLaunchEnvelopeSchema.safeParse({ type: 'WATCH_BRACKET_LAUNCH', schemaVersion: 2, launchToken: 'a'.repeat(43) }).success).toBe(false);
  });

  it('validates a private nomination progress scene without nominee titles', () => {
    const scene = { type: 'NOMINATION_PROGRESS', roomName: 'Friday', roomCode: 'ABC123', deadline: new Date().toISOString(), submittedParticipants: 2, lockedParticipants: 1, totalParticipants: 4, revealed: false, candidates: [] };
    expect(DisplaySceneSchema.parse(scene)).toEqual(scene);
  });
});
