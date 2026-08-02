import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomFromAlphabet(length: number, alphabet = ROOM_CODE_ALPHABET): string {
  if (!Number.isSafeInteger(length) || length < 1) throw new Error('Length must be a positive integer');
  const ceiling = 256 - (256 % alphabet.length);
  let output = '';
  while (output.length < length) {
    for (const byte of randomBytes(Math.max(16, length * 2))) {
      if (byte < ceiling) output += alphabet[byte % alphabet.length];
      if (output.length === length) break;
    }
  }
  return output;
}

export const generateRoomCode = (length = 6) => randomFromAlphabet(length);
export const generatePairingCode = (length = 6) => randomFromAlphabet(length, '23456789');
export const generateSessionToken = () => randomBytes(32).toString('base64url');

export function hashToken(token: string, pepper: string): string {
  return createHmac('sha256', pepper).update(token).digest('base64url');
}

export function compareToken(token: string, expectedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashToken(token, pepper));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const unsafeName = /[\p{Cc}\p{Cf}\p{Cs}]/u;
export function normalizeNickname(value: string): { display: string; normalized: string } {
  const display = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!display || display.length > 32 || unsafeName.test(display)) throw new Error('Invalid nickname');
  return { display, normalized: display.toLocaleLowerCase('en-CA') };
}

export type Actor = { kind: 'ADMIN'; adminId: string } | { kind: 'PARTICIPANT'; participantId: string; role: 'HOST' | 'PARTICIPANT' } | { kind: 'DISPLAY'; displaySessionId: string };
export const canCreateRoom = (actor: Actor) => actor.kind === 'ADMIN';
export const canControlRoom = (actor: Actor) => actor.kind === 'PARTICIPANT' && actor.role === 'HOST';
export const canMutateParticipantState = (actor: Actor) => actor.kind === 'PARTICIPANT';

export const ApiErrorSchema = z.object({
  code: z.string(), message: z.string(), requestId: z.string(), details: z.record(z.string(), z.unknown()).optional()
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
export const apiError = (code: string, message: string, requestId: string, details?: Record<string, unknown>): ApiError =>
  details ? { code, message, requestId, details } : { code, message, requestId };

export function isPairingCodeExpired(expiresAt: Date, now = new Date()): boolean { return expiresAt.getTime() <= now.getTime(); }
export function nextSequence(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0) throw new Error('Invalid sequence');
  return current + 1;
}

