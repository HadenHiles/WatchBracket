import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { participantPlexAccounts, type Database } from '@watch-bracket/db';
import { IntegrationProviderError } from './integrations.js';

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;
const CLIENT_ID = 'watch-bracket-personal-watchlist';
const PRODUCT = 'Watch Bracket';
const PLEX_HEADERS = {
  accept: 'application/json',
  'X-Plex-Product': PRODUCT,
  'X-Plex-Version': '1.0',
  'X-Plex-Client-Identifier': CLIENT_ID,
  'X-Plex-Platform': 'Web',
  'X-Plex-Device-Name': PRODUCT
};
const object = (value: unknown): JsonObject | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | undefined => typeof value === 'string' && value.length ? value : undefined;
const numericText = (value: unknown): string | undefined => typeof value === 'number' && Number.isFinite(value) ? String(value) : text(value);

function encryptionKey(secret: string) {
  return createHash('sha256').update(secret).update('\0participant-plex-token-v1').digest();
}

export function encryptPlexToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptPlexToken(value: string, secret: string) {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new IntegrationProviderError('INVALID_RESPONSE', 'Stored Plex authorization is invalid.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new IntegrationProviderError('INVALID_RESPONSE', 'Stored Plex authorization could not be decrypted.');
  }
}

export type PlexWatchlistReference = { tmdbId: number; mediaType: 'MOVIE' | 'TV'; title: string; year: number | null };

export function parsePlexWatchlist(value: unknown): PlexWatchlistReference[] {
  const container = object(object(value)?.MediaContainer);
  return array(container?.Metadata).flatMap((entry) => {
    const item = object(entry);
    const mediaType = item?.type === 'movie' ? 'MOVIE' as const : item?.type === 'show' ? 'TV' as const : undefined;
    const title = text(item?.title);
    const guids = [text(item?.guid), ...array(item?.Guid).map((guid) => text(object(guid)?.id))].filter((guid): guid is string => Boolean(guid));
    const match = guids.map((guid) => /(?:tmdb|themoviedb):\/\/(\d+)/i.exec(guid)).find(Boolean);
    if (!mediaType || !title || !match?.[1]) return [];
    const year = typeof item?.year === 'number' && Number.isInteger(item.year) ? item.year : null;
    return [{ tmdbId: Number(match[1]), mediaType, title, year }];
  });
}

export class ParticipantPlexAccounts {
  constructor(private readonly db: Database, private readonly secret: string, private readonly fetcher: Fetcher = fetch) {}

  private async request(url: string | URL, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await this.fetcher(url, { ...init, headers: { ...PLEX_HEADERS, ...init.headers }, signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new IntegrationProviderError('UPSTREAM_TIMEOUT', 'Plex sign-in did not respond in time.');
    }
    if (!response.ok) throw new IntegrationProviderError('UPSTREAM_ERROR', `Plex rejected the request (${response.status}).`);
    return response.json() as Promise<unknown>;
  }

  private async account(participantId: string) {
    return (await this.db.select().from(participantPlexAccounts).where(eq(participantPlexAccounts.participantId, participantId)).limit(1))[0];
  }

  async start(participantId: string, forwardUrl: string) {
    const raw = object(await this.request('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ strong: 'true' })
    }));
    const pinId = numericText(raw?.id); const code = text(raw?.code); const expiresIn = typeof raw?.expiresIn === 'number' ? raw.expiresIn : 900;
    if (!pinId || !code) throw new IntegrationProviderError('INVALID_RESPONSE', 'Plex returned an invalid sign-in code.');
    const expiresAt = new Date(Date.now() + Math.max(60, Math.min(expiresIn, 1800)) * 1000);
    await this.db.insert(participantPlexAccounts).values({ participantId, plexPinId: pinId, plexPinCode: code, pinExpiresAt: expiresAt, encryptedToken: null, connectedAt: null, accountLabel: null }).onConflictDoUpdate({
      target: participantPlexAccounts.participantId,
      set: { plexPinId: pinId, plexPinCode: code, pinExpiresAt: expiresAt, encryptedToken: null, connectedAt: null, accountLabel: null, updatedAt: new Date() }
    });
    const params = new URLSearchParams({ clientID: CLIENT_ID, code, forwardUrl });
    params.set('context[device][product]', PRODUCT);
    return { connected: false as const, authUrl: `https://app.plex.tv/auth#?${params}`, expiresAt: expiresAt.toISOString() };
  }

  async status(participantId: string) {
    const account = await this.account(participantId);
    if (!account) return { connected: false, accountLabel: null };
    if (account.encryptedToken) return { connected: true, accountLabel: account.accountLabel ?? 'Plex watchlist' };
    if (!account.plexPinId || !account.plexPinCode || !account.pinExpiresAt || account.pinExpiresAt <= new Date()) return { connected: false, accountLabel: null };
    const url = new URL(`/api/v2/pins/${encodeURIComponent(account.plexPinId)}`, 'https://plex.tv');
    url.searchParams.set('code', account.plexPinCode);
    const raw = object(await this.request(url));
    const token = text(raw?.authToken);
    if (!token) return { connected: false, accountLabel: null };
    const accountLabel = text(raw?.title) ?? text(raw?.username) ?? 'Plex watchlist';
    await this.db.update(participantPlexAccounts).set({ encryptedToken: encryptPlexToken(token, this.secret), accountLabel, connectedAt: new Date(), plexPinId: null, plexPinCode: null, pinExpiresAt: null, updatedAt: new Date() }).where(eq(participantPlexAccounts.participantId, participantId));
    return { connected: true, accountLabel };
  }

  async watchlist(participantId: string, limit: number) {
    const account = await this.account(participantId);
    if (!account?.encryptedToken) throw new IntegrationProviderError('NOT_CONFIGURED', 'Connect your Plex account to load your watchlist.');
    const token = decryptPlexToken(account.encryptedToken, this.secret);
    const url = new URL('/library/sections/watchlist/all', 'https://discover.provider.plex.tv');
    url.searchParams.set('includeGuids', '1');
    url.searchParams.set('includeMeta', '1');
    url.searchParams.set('X-Plex-Container-Start', '0');
    url.searchParams.set('X-Plex-Container-Size', String(limit));
    const raw = await this.request(url, { headers: { 'X-Plex-Token': token } });
    return parsePlexWatchlist(raw).slice(0, limit);
  }

  async unlink(participantId: string) {
    await this.db.delete(participantPlexAccounts).where(eq(participantPlexAccounts.participantId, participantId));
    return { unlinked: true as const };
  }
}
