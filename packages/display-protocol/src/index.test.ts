import { describe, expect, it } from 'vitest';
import { CastLaunchEnvelopeSchema } from './index.js';

describe('Cast launch protocol', () => {
  it('accepts only the versioned opaque launch envelope', () => {
    expect(CastLaunchEnvelopeSchema.safeParse({ type: 'WATCH_BRACKET_LAUNCH', schemaVersion: 1, launchToken: 'a'.repeat(43) }).success).toBe(true);
    expect(CastLaunchEnvelopeSchema.safeParse({ type: 'WATCH_BRACKET_LAUNCH', schemaVersion: 2, launchToken: 'a'.repeat(43) }).success).toBe(false);
  });
});
