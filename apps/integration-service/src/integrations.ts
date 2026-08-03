import type { z } from 'zod';
import { PlexInventoryItemSchema, type ProviderError } from '@watch-bracket/provider-contracts';

type ErrorCode = ProviderError['error']['code'];
type Fetcher = typeof fetch;

export class IntegrationProviderError extends Error {
  constructor(public readonly code: ErrorCode, message: string) { super(message); }
}

class PrivateProviderClient {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly name: string,
    private readonly baseUrl: string | undefined,
    private readonly headers: Record<string, string>,
    private readonly fetcher: Fetcher = fetch
  ) {}

  get configured() { return Boolean(this.baseUrl && !this.baseUrl.toLowerCase().includes('replace-me')); }
  get circuit() { return this.openUntil > Date.now() ? 'OPEN' as const : 'CLOSED' as const; }

  async request(path: string, init: RequestInit = {}) {
    if (!this.configured) throw new IntegrationProviderError('NOT_CONFIGURED', `${this.name} is not configured.`);
    if (this.openUntil > Date.now()) throw new IntegrationProviderError('CIRCUIT_OPEN', `${this.name} is recovering from an outage.`);
    const url = new URL(path, this.baseUrl);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetcher(url, { ...init, headers: { accept: 'application/json', ...this.headers, ...init.headers }, signal: AbortSignal.timeout(5_000) });
        if (response.ok) { this.failures = 0; return response; }
        if (response.status < 500 && response.status !== 429) throw new IntegrationProviderError('UPSTREAM_ERROR', `${this.name} rejected the operation (${response.status}).`);
        if (attempt === 2) throw new IntegrationProviderError('UPSTREAM_ERROR', `${this.name} is temporarily unavailable.`);
      } catch (error) {
        if (error instanceof IntegrationProviderError && error.code !== 'UPSTREAM_ERROR') throw error;
        if (attempt === 2) {
          this.failures += 1;
          if (this.failures >= 3) this.openUntil = Date.now() + 60_000;
          const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
          throw new IntegrationProviderError(timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', `${this.name} did not respond in time.`);
        }
      }
    }
    throw new IntegrationProviderError('UPSTREAM_ERROR', `${this.name} is temporarily unavailable.`);
  }

  async json(path: string, init?: RequestInit): Promise<unknown> { return (await this.request(path, init)).json(); }
}

const object = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const integer = (value: unknown): number | undefined => typeof value === 'number' && Number.isInteger(value) ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : undefined;
const tmdbGuid = (value: unknown) => {
  const values = [text(value), ...array(value).map((entry) => text(object(entry)?.id))].filter((entry): entry is string => Boolean(entry));
  for (const guid of values) { const match = /(?:tmdb:\/\/|themoviedb:\/\/)(\d+)/i.exec(guid); if (match) return Number(match[1]); }
  return null;
};

export class PlexProvider {
  private readonly client: PrivateProviderClient;
  private inventoryCache?: { expiresAt: number; value: Awaited<ReturnType<PlexProvider['loadInventory']>> };

  constructor(baseUrl: string | undefined, token: string | undefined, private readonly publicUrl?: string, fetcher: Fetcher = fetch) {
    this.client = new PrivateProviderClient('Plex', baseUrl, token ? { 'X-Plex-Token': token, 'X-Plex-Product': 'Watch Bracket', 'X-Plex-Client-Identifier': 'watch-bracket-integration' } : {}, fetcher);
  }
  get configured() { return this.client.configured; }
  get circuit() { return this.client.circuit; }
  async health() { await this.client.json('/identity'); return true; }

  private async loadInventory(libraryIds?: string[]) {
    const identity = object(object(await this.client.json('/identity'))?.MediaContainer);
    const machineIdentifier = text(identity?.machineIdentifier);
    const root = object(object(await this.client.json('/library/sections'))?.MediaContainer);
    const directories = array(root?.Directory);
    const libraries = directories.flatMap((entry) => {
      const item = object(entry); const id = text(item?.key); const title = text(item?.title); const type = text(item?.type);
      return id && title && (type === 'movie' || type === 'show') ? [{ id, title, mediaType: type === 'movie' ? 'MOVIE' as const : 'TV' as const }] : [];
    }).filter((library) => !libraryIds?.length || libraryIds.includes(library.id));
    const items: Array<z.infer<typeof PlexInventoryItemSchema>> = [];
    for (const library of libraries) {
      const raw = object(object(await this.client.json(`/library/sections/${encodeURIComponent(library.id)}/all?type=${library.mediaType === 'MOVIE' ? 1 : 2}`))?.MediaContainer);
      for (const entry of array(raw?.Metadata)) {
        const item = object(entry); const ratingKey = text(item?.ratingKey); const title = text(item?.title);
        if (!ratingKey || !title) continue;
        items.push(PlexInventoryItemSchema.parse({
          tmdbId: tmdbGuid(item?.Guid ?? item?.guid), mediaType: library.mediaType, ratingKey, title,
          year: integer(item?.year) ?? null, libraryId: library.id, libraryTitle: library.title,
          plexUrl: machineIdentifier ? this.titleUrl(machineIdentifier, ratingKey) : null,
          episodeCount: library.mediaType === 'TV' ? integer(item?.leafCount) ?? 0 : null
        }));
      }
    }
    return { libraries, items, refreshedAt: new Date().toISOString() };
  }
  private titleUrl(machineIdentifier: string, ratingKey: string) {
    const path = encodeURIComponent(`/library/metadata/${ratingKey}`);
    if (!this.publicUrl)
      return `https://app.plex.tv/desktop/#!/server/${encodeURIComponent(machineIdentifier)}/details?key=${path}`;
    const url = new URL('/web/index.html', this.publicUrl);
    url.hash = `!/server/${encodeURIComponent(machineIdentifier)}/details?key=${path}`;
    return url.toString();
  }

  async inventory(libraryIds?: string[], force = false) {
    if (!force && !libraryIds?.length && this.inventoryCache && this.inventoryCache.expiresAt > Date.now()) return this.inventoryCache.value;
    const value = await this.loadInventory(libraryIds);
    if (!libraryIds?.length) this.inventoryCache = { value, expiresAt: Date.now() + 30 * 60_000 };
    return value;
  }
}

export class TautulliProvider {
  private readonly client: PrivateProviderClient;
  constructor(baseUrl: string | undefined, apiKey: string | undefined, fetcher: Fetcher = fetch) {
    this.client = new PrivateProviderClient('Tautulli', baseUrl, {}, fetcher);
    this.apiKey = apiKey;
  }
  private readonly apiKey: string | undefined;
  get configured() { return this.client.configured && Boolean(this.apiKey); }
  get circuit() { return this.client.circuit; }
  private path(command: string, params: Record<string, string | number> = {}) { const query = new URLSearchParams({ apikey: this.apiKey ?? '', cmd: command }); for (const [key, value] of Object.entries(params)) query.set(key, String(value)); return `/api/v2?${query}`; }
  async health() { const raw = object(await this.client.json(this.path('get_libraries'))); if (object(raw?.response)?.result !== 'success') throw new IntegrationProviderError('INVALID_RESPONSE', 'Tautulli returned an invalid response.'); return true; }
  async history(limit: number) {
    if (!this.configured) throw new IntegrationProviderError('NOT_CONFIGURED', 'Tautulli is not configured.');
    const raw = object(await this.client.json(this.path('get_history', { length: limit, grouping: 1 }))); const response = object(raw?.response); const data = object(response?.data); const rows = array(data?.data);
    if (response?.result !== 'success') throw new IntegrationProviderError('INVALID_RESPONSE', 'Tautulli returned invalid history.');
    const aggregate = new Map<string, { tmdbId: number | null; mediaType: 'MOVIE' | 'TV' | null; title: string; playCount: number; lastWatchedAt: string | null }>();
    for (const entry of rows) {
      const row = object(entry); const titleValue = text(row?.grandparent_title) ?? text(row?.parent_title) ?? text(row?.title); if (!titleValue) continue;
      const mediaType = row?.media_type === 'movie' ? 'MOVIE' as const : row?.media_type === 'episode' ? 'TV' as const : null;
      const id = tmdbGuid(row?.guid); const key = id ? `${mediaType}:${id}` : `${mediaType}:${titleValue.toLowerCase()}`; const watched = integer(row?.date) ?? integer(row?.started);
      const prior = aggregate.get(key) ?? { tmdbId: id, mediaType, title: titleValue, playCount: 0, lastWatchedAt: null };
      prior.playCount += integer(row?.play_count) ?? 1;
      if (watched) { const stamp = new Date(watched * 1000).toISOString(); if (!prior.lastWatchedAt || stamp > prior.lastWatchedAt) prior.lastWatchedAt = stamp; }
      aggregate.set(key, prior);
    }
    return { items: [...aggregate.values()].sort((a, b) => b.playCount - a.playCount || a.title.localeCompare(b.title)), refreshedAt: new Date().toISOString() };
  }
}

const seerrStatus = (value: unknown) => {
  const code = integer(value);
  return code === 2 ? 'PENDING' as const : code === 3 ? 'PROCESSING' as const : code === 4 ? 'PARTIAL' as const : code === 5 ? 'AVAILABLE' as const : code === 6 ? 'UNAVAILABLE' as const : 'REQUESTABLE' as const;
};

export class SeerrProvider {
  private readonly client: PrivateProviderClient;
  private readonly baseUrl: string | undefined;
  constructor(baseUrl: string | undefined, apiKey: string | undefined, private readonly publicUrl?: string, fetcher: Fetcher = fetch) { this.baseUrl = baseUrl; this.client = new PrivateProviderClient('Seerr', baseUrl, apiKey ? { 'X-Api-Key': apiKey } : {}, fetcher); }
  get configured() { return this.client.configured; }
  get circuit() { return this.client.circuit; }
  async health() { await this.client.json('/api/v1/status'); return true; }
  async statuses(items: Array<{ tmdbId: number; mediaType: 'MOVIE' | 'TV' }>) {
    const values = await Promise.all(items.map(async (item) => {
      const mediaPath = item.mediaType === 'MOVIE' ? 'movie' : 'tv';
      const requestUrl = this.publicUrl ? new URL(`/${mediaPath}/${item.tmdbId}`, this.publicUrl).toString() : this.baseUrl ? new URL(`/${mediaPath}/${item.tmdbId}`, this.baseUrl).toString() : null;
      try { const raw = object(await this.client.json(`/api/v1/${mediaPath}/${item.tmdbId}`)); const status = seerrStatus(object(raw?.mediaInfo)?.status); return { ...item, status, requestable: status === 'REQUESTABLE' || status === 'UNAVAILABLE', requestUrl }; }
      catch (error) { if (error instanceof IntegrationProviderError && error.code === 'UPSTREAM_ERROR') return { ...item, status: 'UNKNOWN' as const, requestable: false, requestUrl }; throw error; }
    }));
    return values;
  }
  async request(input: { tmdbId: number; mediaType: 'MOVIE' | 'TV'; tvSeasonPolicy?: 'FIRST' | 'LATEST' | 'ALL' | undefined }) {
    const payload: Record<string, unknown> = { mediaType: input.mediaType === 'MOVIE' ? 'movie' : 'tv', mediaId: input.tmdbId };
    if (input.mediaType === 'TV') {
      if (input.tvSeasonPolicy === 'ALL') payload.seasons = 'all';
      else if (input.tvSeasonPolicy === 'LATEST') {
        const details = object(await this.client.json(`/api/v1/tv/${input.tmdbId}`));
        const seasonNumbers = array(details?.seasons)
          .map((season) => integer(object(season)?.seasonNumber ?? object(season)?.season_number))
          .filter((season): season is number => season !== undefined && season > 0);
        const latest = seasonNumbers.length ? Math.max(...seasonNumbers) : integer(details?.numberOfSeasons);
        if (!latest || latest < 1) throw new IntegrationProviderError('INVALID_RESPONSE', 'Seerr did not return a requestable latest season.');
        payload.seasons = [latest];
      } else payload.seasons = [1];
    }
    const raw = object(await this.client.json('/api/v1/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
    const id = integer(raw?.id); if (!id) throw new IntegrationProviderError('INVALID_RESPONSE', 'Seerr returned an invalid request record.');
    return { requestId: id, status: seerrStatus(object(raw?.media)?.status ?? raw?.status) };
  }
}
