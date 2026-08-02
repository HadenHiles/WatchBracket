import { describe, expect, it } from 'vitest';
import { apiError, canControlRoom, compareToken, generatePairingCode, generateRoomCode, hashToken, isPairingCodeExpired, nextSequence, normalizeNickname, ROOM_CODE_ALPHABET } from './index.js';

describe('shared domain utilities', () => {
  it('generates six-character unambiguous room codes', () => {
    for (let i = 0; i < 100; i++) expect(generateRoomCode()).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
  });
  it('normalizes nicknames safely', () => expect(normalizeNickname('  HéLLo   There ')).toEqual({ display: 'HéLLo There', normalized: 'héllo there' }));
  it('rejects unsafe nicknames', () => expect(() => normalizeNickname('bad\u0000name')).toThrow());
  it('hashes and compares tokens with a pepper', () => {
    const hash = hashToken('token', 'pepper');
    expect(compareToken('token', hash, 'pepper')).toBe(true);
    expect(compareToken('wrong', hash, 'pepper')).toBe(false);
  });
  it('hashes pairing codes and checks expiry', () => {
    const code = generatePairingCode();
    expect(compareToken(code, hashToken(code, 'pepper'), 'pepper')).toBe(true);
    expect(isPairingCodeExpired(new Date(0))).toBe(true);
  });
  it('enforces host role authorization', () => {
    expect(canControlRoom({ kind: 'PARTICIPANT', participantId: 'p', role: 'HOST' })).toBe(true);
    expect(canControlRoom({ kind: 'DISPLAY', displaySessionId: 'd' })).toBe(false);
  });
  it('increments event sequences', () => expect(nextSequence(41)).toBe(42));
  it('serializes the error contract', () => expect(apiError('NOPE', 'Nope', 'req')).toEqual({ code: 'NOPE', message: 'Nope', requestId: 'req' }));
});

