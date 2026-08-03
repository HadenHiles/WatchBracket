import { and, desc, eq, gt, inArray } from "drizzle-orm";
import {
  candidates,
  households,
  matchups,
  mediaItems,
  rooms,
  tournaments,
  watchBracketHistory,
  type Database,
} from "@watch-bracket/db";

export type TasteSnapshot = {
  dominantGenres: string[];
  closestMatchup: { winnerTitle: string; loserTitle: string; margin: number } | null;
  surpriseWildcard: string | null;
  consensusPercent: number | null;
};

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export async function ensureRoomHistory(db: Database, roomId: string) {
  const [room] = await db
    .select({ householdId: rooms.householdId, historyEnabled: households.historyEnabled })
    .from(rooms)
    .innerJoin(households, eq(households.id, rooms.householdId))
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room?.historyEnabled) return undefined;
  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.roomId, roomId))
    .limit(1);
  if (!tournament?.championCandidateId || tournament.status !== "COMPLETED") return undefined;
  const pool = await db
    .select({
      candidateId: candidates.id,
      mediaItemId: candidates.mediaItemId,
      seed: candidates.seed,
      sourceType: candidates.sourceType,
      title: mediaItems.title,
      genres: mediaItems.genres,
    })
    .from(candidates)
    .innerJoin(mediaItems, eq(mediaItems.id, candidates.mediaItemId))
    .where(eq(candidates.roomId, roomId));
  const resolved = await db
    .select({
      winnerCandidateId: matchups.winnerCandidateId,
      loserCandidateId: matchups.loserCandidateId,
      resolution: matchups.resolution,
      sequence: matchups.sequence,
    })
    .from(matchups)
    .where(eq(matchups.tournamentId, tournament.id));
  const byCandidate = new Map(pool.map((item) => [item.candidateId, item]));
  const genreCounts = new Map<string, number>();
  for (const item of pool) for (const genre of strings(item.genres)) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
  const dominantGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([genre]) => genre);
  const scored = resolved.flatMap((item) => {
    if (!item.winnerCandidateId || !item.loserCandidateId || !item.resolution || typeof item.resolution !== "object") return [];
    const result = item.resolution as Record<string, unknown>;
    const votesA = typeof result.votesA === "number" ? result.votesA : 0;
    const votesB = typeof result.votesB === "number" ? result.votesB : 0;
    return [{ ...item, margin: Math.abs(votesA - votesB), votesA, votesB }];
  });
  const closest = scored.sort((a, b) => a.margin - b.margin || b.sequence - a.sequence)[0];
  const final = [...scored].sort((a, b) => b.sequence - a.sequence)[0];
  const champion = byCandidate.get(tournament.championCandidateId);
  if (!champion) return undefined;
  const totalFinalVotes = final ? final.votesA + final.votesB : 0;
  const snapshot: TasteSnapshot = {
    dominantGenres,
    closestMatchup: closest
      ? {
          winnerTitle: byCandidate.get(closest.winnerCandidateId!)?.title ?? "Winner",
          loserTitle: byCandidate.get(closest.loserCandidateId!)?.title ?? "Runner-up",
          margin: closest.margin,
        }
      : null,
    surpriseWildcard: champion.sourceType !== "DIRECT" ? champion.title : null,
    consensusPercent: totalFinalVotes ? Math.round((Math.max(final!.votesA, final!.votesB) / totalFinalVotes) * 100) : null,
  };
  const [stored] = await db
    .insert(watchBracketHistory)
    .values({
      householdId: room.householdId,
      roomId,
      winnerMediaItemId: champion.mediaItemId,
      candidateMediaItemIds: pool.map((item) => item.mediaItemId),
      tasteSnapshot: snapshot,
      completedAt: tournament.completedAt ?? new Date(),
    })
    .onConflictDoUpdate({
      target: watchBracketHistory.roomId,
      set: {
        winnerMediaItemId: champion.mediaItemId,
        tasteSnapshot: snapshot,
        candidateMediaItemIds: pool.map((item) => item.mediaItemId),
      },
    })
    .returning();
  return stored;
}

export async function getRoomTasteSnapshot(db: Database, roomId: string): Promise<TasteSnapshot | null> {
  const [stored] = await db
    .select({ tasteSnapshot: watchBracketHistory.tasteSnapshot })
    .from(watchBracketHistory)
    .where(eq(watchBracketHistory.roomId, roomId))
    .limit(1);
  return (stored?.tasteSnapshot as TasteSnapshot | undefined) ?? null;
}

export async function getRecentMediaExclusions(db: Database, householdId: string, days: number) {
  if (days <= 0) return new Set<string>();
  const rows = await db
    .select({ winner: watchBracketHistory.winnerMediaItemId, candidates: watchBracketHistory.candidateMediaItemIds })
    .from(watchBracketHistory)
    .where(and(eq(watchBracketHistory.householdId, householdId), gt(watchBracketHistory.completedAt, new Date(Date.now() - days * 86_400_000))))
    .orderBy(desc(watchBracketHistory.completedAt));
  return new Set(rows.flatMap((row) => [row.winner, ...strings(row.candidates)]));
}

export async function clearHouseholdHistory(db: Database, householdId: string) {
  const roomRows = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.householdId, householdId));
  if (!roomRows.length) return [];
  return db.delete(watchBracketHistory).where(inArray(watchBracketHistory.roomId, roomRows.map((room) => room.id))).returning({ id: watchBracketHistory.id });
}
