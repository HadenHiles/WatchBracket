import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "@watch-bracket/db";
import {
  auditEvents,
  candidates,
  matchups,
  mediaItems,
  participants,
  rooms,
  rounds,
  submissions,
  tournaments,
  votes,
} from "@watch-bracket/db";
import {
  advanceTournament,
  createTournament,
  resolveBallots,
  type EngineCandidate,
  type EngineResult,
  type TournamentFormat,
  type TournamentStage,
  type TournamentState,
} from "@watch-bracket/tournament-engine";
import { MediaAvailabilitySchema } from "@watch-bracket/provider-contracts";
import type { DomainContext } from "./domain.js";
import { DomainError, requireRoomHost } from "./domain.js";
import { prepareTmdbWildcards } from "./recommendations.js";
import { ensureRoomHistory, getRoomTasteSnapshot } from "./history.js";

const INTRO_SECONDS = 3,
  RESULT_SECONDS = 4;
const stageSequence: Record<TournamentStage, number> = {
  QUALIFIER: 1,
  SPOTLIGHT: 2,
  REDEMPTION: 3,
  REDEMPTION_FINAL: 4,
  CHAMPIONSHIP_PLAY_IN: 5,
  CHAMPIONSHIP_SEMI: 6,
  CHAMPIONSHIP_FINAL: 7,
};
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function stableCandidateId(roomId: string, mediaItemId: string) {
  const hex = createHash("sha256")
    .update(`${roomId}:${mediaItemId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
const stableScore = (seed: string, key: string) =>
  parseInt(
    createHash("sha256").update(`${seed}:${key}`).digest("hex").slice(0, 6),
    16,
  ) % 1000;
function parseEngine(value: unknown): TournamentState {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1
  )
    throw new DomainError(
      "TOURNAMENT_STATE_INVALID",
      "Stored tournament state is invalid.",
      500,
    );
  return value as TournamentState;
}

async function createCurrentMatchup(
  tx: Transaction,
  tournamentId: string,
  roomId: string,
  state: TournamentState,
  voteDurationSeconds: number,
) {
  const planned = state.pending[0];
  if (!planned)
    throw new DomainError(
      "TOURNAMENT_COMPLETE",
      "The tournament has no pending matchup.",
      409,
    );
  let [round] = await tx
    .select()
    .from(rounds)
    .where(
      and(
        eq(rounds.tournamentId, tournamentId),
        eq(rounds.stage, planned.stage),
      ),
    )
    .limit(1);
  if (!round)
    [round] = await tx
      .insert(rounds)
      .values({
        tournamentId,
        roomId,
        stage: planned.stage,
        sequence: stageSequence[planned.stage],
      })
      .returning();
  const eligible = await tx
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.roomId, roomId),
        isNull(participants.removedAt),
        ne(participants.role, "SPECTATOR"),
      ),
    )
    .orderBy(asc(participants.joinedAt));
  const introEndsAt = new Date(Date.now() + INTRO_SECONDS * 1000);
  const inserted = await tx
    .insert(matchups)
    .values({
      tournamentId,
      roomId,
      roundId: round!.id,
      engineKey: planned.key,
      sequence: planned.sequence,
      stage: planned.stage,
      candidateAId: planned.candidateAId,
      candidateBId: planned.candidateBId,
      eligibleParticipantIds: eligible.map((item) => item.id),
      introEndsAt,
    })
    .onConflictDoNothing({
      target: [matchups.tournamentId, matchups.engineKey],
    })
    .returning();
  const matchup =
    inserted[0] ??
    (
      await tx
        .select()
        .from(matchups)
        .where(
          and(
            eq(matchups.tournamentId, tournamentId),
            eq(matchups.engineKey, planned.key),
          ),
        )
        .limit(1)
    )[0];
  await tx
    .update(rooms)
    .set({
      state: "MATCHUP_INTRO",
      version: sql`${rooms.version}+1`,
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, roomId));
  return { matchup: matchup!, voteDurationSeconds };
}

export async function startTournament(
  ctx: DomainContext,
  participantId: string,
  roomId: string,
  input: { format: TournamentFormat; voteDurationSeconds: number },
) {
  await requireRoomHost(ctx.db, participantId, roomId);
  let preparedWildcards: Awaited<ReturnType<typeof prepareTmdbWildcards>> = [];
  try {
    preparedWildcards = await prepareTmdbWildcards(ctx, roomId, input.format);
  } catch (error) {
    if (ctx.env.NODE_ENV === "production") throw error;
  }
  return ctx.db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .for("update")
      .limit(1);
    if (!room || room.state !== "NOMINATIONS_LOCKED")
      throw new DomainError(
        "TOURNAMENT_NOT_READY",
        "Reveal nominations before building the tournament.",
        409,
      );
    const existing = await tx
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.roomId, roomId))
      .limit(1);
    if (existing.length)
      throw new DomainError(
        "TOURNAMENT_ALREADY_STARTED",
        "The tournament has already started.",
        409,
      );
    const nominated = await tx
      .select({
        mediaItemId: submissions.mediaItemId,
        participantId: submissions.participantId,
        rank: submissions.rank,
        catalogKey: mediaItems.catalogKey,
      })
      .from(submissions)
      .innerJoin(mediaItems, eq(submissions.mediaItemId, mediaItems.id))
      .where(eq(submissions.roomId, roomId));
    const grouped = new Map<
      string,
      {
        mediaItemId: string;
        catalogKey: string;
        nominators: Set<string>;
        first: number;
      }
    >();
    for (const item of nominated) {
      const current = grouped.get(item.mediaItemId) ?? {
        mediaItemId: item.mediaItemId,
        catalogKey: item.catalogKey,
        nominators: new Set<string>(),
        first: 0,
      };
      current.nominators.add(item.participantId);
      if (item.rank === 1) current.first++;
      grouped.set(item.mediaItemId, current);
    }
    type PoolItem = {
      mediaItemId: string;
      catalogKey: string;
      nominators: Set<string>;
      first: number;
      sourceType: "DIRECT" | "MOCK_WILDCARD" | "TMDB_WILDCARD";
      scoreTotal: number;
      scoreComponents: Record<string, number>;
      reasonCodes: string[];
    };
    let pool: PoolItem[] = [...grouped.values()]
      .map((item) => {
        const support = item.nominators.size;
        const second = support - item.first;
        const rankPoints = item.first * 3 + second * 2;
        return {
          ...item,
          sourceType: "DIRECT" as const,
          scoreTotal: 8000 + support * 500 + rankPoints * 100,
          scoreComponents: {
            directSupport: support,
            firstChoiceSupport: item.first,
            secondChoiceSupport: second,
            rankPoints,
          },
          reasonCodes: [
            support > 1 ? "Shared group nomination" : "Direct group nomination",
            item.first > 0 ? "Includes first-choice support" : "Second-choice support",
          ],
        };
      })
      .sort(
        (a, b) =>
          b.nominators.size - a.nominators.size ||
          (b.scoreComponents.rankPoints ?? 0) -
            (a.scoreComponents.rankPoints ?? 0) ||
          a.catalogKey.localeCompare(b.catalogKey),
      );
    const selectedIds = new Set(pool.map((item) => item.mediaItemId));
    const tmdbFillers: PoolItem[] = preparedWildcards
      .filter((item) => !selectedIds.has(item.mediaItemId))
      .map((item) => ({
        ...item,
        nominators: new Set<string>(),
        first: 0,
        sourceType: "TMDB_WILDCARD",
        reasonCodes: item.reasonCodes,
      }));
    pool = [...pool.slice(0, input.format), ...tmdbFillers].slice(
      0,
      input.format,
    );
    if (pool.length < input.format && ctx.env.NODE_ENV !== "production") {
      const allMedia = await tx
        .select({ id: mediaItems.id, catalogKey: mediaItems.catalogKey })
        .from(mediaItems);
      const currentIds = new Set(pool.map((item) => item.mediaItemId));
      const mockFillers: PoolItem[] = allMedia
        .filter(
          (item) =>
            item.catalogKey.startsWith("mock:") && !currentIds.has(item.id),
        )
        .sort(
          (a, b) =>
            stableScore(room.randomSeed, a.catalogKey) -
            stableScore(room.randomSeed, b.catalogKey),
        )
        .map((item) => ({
          mediaItemId: item.id,
          catalogKey: item.catalogKey,
          nominators: new Set<string>(),
          first: 0,
          sourceType: "MOCK_WILDCARD",
          scoreTotal: 5000 + stableScore(room.randomSeed, item.catalogKey),
          scoreComponents: {
            seededMockScore:
              stableScore(room.randomSeed, item.catalogKey) / 1000,
          },
          reasonCodes: ["Deterministic development wildcard"],
        }));
      pool = [...pool, ...mockFillers].slice(0, input.format);
    }
    if (pool.length !== input.format)
      throw new DomainError(
        "NOT_ENOUGH_CANDIDATES",
        `A ${input.format}-title bracket needs ${input.format} valid titles. Try more direct nominations or adjust the room rules.`,
        409,
      );
    const engineInput = pool.map((item) => ({
      id: stableCandidateId(roomId, item.mediaItemId),
      score: item.scoreTotal,
      supportCount: item.nominators.size,
      firstChoiceCount: item.first,
      nominatorIds: [...item.nominators],
    }));
    const engine = createTournament(engineInput, input.format, room.randomSeed);
    const seedById = new Map(
      engine.candidates.map((item) => [item.id, item.seed]),
    );
    await tx
      .insert(candidates)
      .values(
        pool.map((item) => ({
          id: stableCandidateId(roomId, item.mediaItemId),
          roomId,
          mediaItemId: item.mediaItemId,
          sourceType: item.sourceType,
          scoreTotal: item.scoreTotal,
          scoreComponents: item.scoreComponents,
          supportCount: item.nominators.size,
          firstChoiceCount: item.first,
          nominatorIds: [...item.nominators],
          reasonCodes: item.reasonCodes,
          seed: seedById.get(stableCandidateId(roomId, item.mediaItemId))!,
        })),
      );
    const [tournament] = await tx
      .insert(tournaments)
      .values({
        roomId,
        format: input.format,
        voteDurationSeconds: input.voteDurationSeconds,
        engineState: engine,
      })
      .returning();
    await createCurrentMatchup(
      tx,
      tournament!.id,
      roomId,
      engine,
      input.voteDurationSeconds,
    );
    await tx
      .insert(auditEvents)
      .values({
        householdId: room.householdId,
        roomId,
        actorType: "PARTICIPANT",
        actorId: participantId,
        eventType: "TOURNAMENT_STARTED",
        metadata: {
          format: input.format,
          voteDurationSeconds: input.voteDurationSeconds,
          candidateCount: pool.length,
        },
      });
    return { tournament: tournament!, engine };
  });
}

export async function autoStartTournament(
  ctx: DomainContext,
  roomId: string,
) {
  const [room] = await ctx.db
    .select({ hostParticipantId: rooms.hostParticipantId, state: rooms.state })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room || room.state !== "NOMINATIONS_LOCKED")
    throw new DomainError(
      "TOURNAMENT_NOT_READY",
      "Nominations are not ready for automatic tournament start.",
      409,
    );
  if (!room.hostParticipantId)
    throw new DomainError(
      "HOST_REQUIRED",
      "The room has no host to start its tournament.",
      409,
    );
  return startTournament(ctx, room.hostParticipantId, roomId, {
    format: 8,
    voteDurationSeconds: 30,
  });
}

export async function submitVote(
  ctx: DomainContext,
  participantId: string,
  matchupId: string,
  input: { candidateId?: string | undefined; abstain: boolean },
) {
  return ctx.db.transaction(async (tx) => {
    const [matchup] = await tx
      .select()
      .from(matchups)
      .where(eq(matchups.id, matchupId))
      .for("update")
      .limit(1);
    if (
      !matchup ||
      matchup.status !== "VOTING" ||
      !matchup.votingEndsAt ||
      matchup.votingEndsAt.getTime() <= Date.now()
    )
      throw new DomainError(
        "VOTING_CLOSED",
        "Voting is closed for this matchup.",
        409,
      );
    const eligible = Array.isArray(matchup.eligibleParticipantIds)
      ? matchup.eligibleParticipantIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [];
    if (!eligible.includes(participantId))
      throw new DomainError(
        "VOTE_NOT_ELIGIBLE",
        "You are not eligible to vote in this matchup.",
        403,
      );
    if (
      !input.abstain &&
      input.candidateId !== matchup.candidateAId &&
      input.candidateId !== matchup.candidateBId
    )
      throw new DomainError(
        "VOTE_INVALID",
        "Vote for one of the current titles or abstain.",
        400,
      );
    await tx
      .insert(votes)
      .values({
        matchupId,
        participantId,
        candidateId: input.abstain ? null : input.candidateId!,
        abstained: input.abstain,
      })
      .onConflictDoUpdate({
        target: [votes.matchupId, votes.participantId],
        set: {
          candidateId: input.abstain ? null : input.candidateId!,
          abstained: input.abstain,
          updatedAt: new Date(),
        },
      });
    const [ballotCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(votes)
      .where(eq(votes.matchupId, matchupId));
    const allVotesReceived =
      eligible.length > 0 && (ballotCount?.count ?? 0) >= eligible.length;
    if (allVotesReceived)
      await tx
        .update(matchups)
        .set({ votingEndsAt: new Date() })
        .where(and(eq(matchups.id, matchupId), eq(matchups.status, "VOTING")));
    await tx
      .update(rooms)
      .set({ version: sql`${rooms.version}+1`, updatedAt: new Date() })
      .where(eq(rooms.id, matchup.roomId));
    return {
      roomId: matchup.roomId,
      matchupId,
      accepted: true,
      allVotesReceived,
      abstained: input.abstain,
      candidateId: input.abstain ? null : input.candidateId!,
    };
  });
}

export async function extendVoting(
  ctx: DomainContext,
  participantId: string,
  roomId: string,
  seconds: number,
) {
  const room = await requireRoomHost(ctx.db, participantId, roomId);
  const [matchup] = await ctx.db
    .update(matchups)
    .set({
      votingEndsAt: sql`${matchups.votingEndsAt}+(${seconds} * interval '1 second')`,
    })
    .where(
      and(
        eq(matchups.roomId, roomId),
        eq(matchups.status, "VOTING"),
        isNull(matchups.advancedAt),
      ),
    )
    .returning();
  if (!matchup?.votingEndsAt)
    throw new DomainError(
      "VOTING_NOT_ACTIVE",
      "There is no active vote to extend.",
      409,
    );
  await ctx.db
    .update(rooms)
    .set({ version: sql`${rooms.version}+1`, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
  await ctx.db
    .insert(auditEvents)
    .values({
      householdId: room.householdId,
      roomId,
      actorType: "PARTICIPANT",
      actorId: participantId,
      eventType: "VOTING_EXTENDED",
      metadata: {
        matchupId: matchup.id,
        seconds,
        deadline: matchup.votingEndsAt.toISOString(),
      },
    });
  return matchup.votingEndsAt;
}

export async function skipPresentation(
  ctx: DomainContext,
  participantId: string,
  roomId: string,
) {
  const authorizedRoom = await requireRoomHost(ctx.db, participantId, roomId);
  const [room] = await ctx.db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room || !["MATCHUP_INTRO", "MATCHUP_RESULT"].includes(room.state))
    throw new DomainError(
      "PRESENTATION_NOT_SKIPPABLE",
      "Only matchup intro and result presentation can be skipped.",
      409,
    );
  const now = new Date(0);
  if (room.state === "MATCHUP_INTRO")
    await ctx.db
      .update(matchups)
      .set({ introEndsAt: now })
      .where(
        and(
          eq(matchups.roomId, roomId),
          eq(matchups.status, "INTRO"),
          isNull(matchups.advancedAt),
        ),
      );
  else
    await ctx.db
      .update(matchups)
      .set({ resultEndsAt: now })
      .where(
        and(
          eq(matchups.roomId, roomId),
          eq(matchups.status, "RESOLVED"),
          isNull(matchups.advancedAt),
        ),
      );
  const result = await processTournamentTransition(ctx, roomId);
  await ctx.db
    .insert(auditEvents)
    .values({
      householdId: authorizedRoom.householdId,
      roomId,
      actorType: "PARTICIPANT",
      actorId: participantId,
      eventType: "PRESENTATION_SKIPPED",
      metadata: { fromState: room.state },
    });
  return result;
}

export async function processTournamentTransition(
  ctx: DomainContext,
  roomId: string,
) {
  const result = await ctx.db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .for("update")
      .limit(1);
    if (
      !room ||
      !["MATCHUP_INTRO", "VOTING", "MATCHUP_RESULT"].includes(room.state)
    )
      return { changed: false };
    const [tournament] = await tx
      .select()
      .from(tournaments)
      .where(eq(tournaments.roomId, roomId))
      .for("update")
      .limit(1);
    if (!tournament) return { changed: false };
    const [matchup] = await tx
      .select()
      .from(matchups)
      .where(
        and(
          eq(matchups.tournamentId, tournament.id),
          isNull(matchups.advancedAt),
        ),
      )
      .orderBy(desc(matchups.sequence))
      .limit(1);
    if (!matchup) return { changed: false };
    const now = new Date();
    if (matchup.status === "INTRO" && matchup.introEndsAt <= now) {
      const votingEndsAt = new Date(
        now.getTime() + tournament.voteDurationSeconds * 1000,
      );
      await tx
        .update(matchups)
        .set({ status: "VOTING", votingStartsAt: now, votingEndsAt })
        .where(and(eq(matchups.id, matchup.id), eq(matchups.status, "INTRO")));
      await tx
        .update(rooms)
        .set({
          state: "VOTING",
          version: sql`${rooms.version}+1`,
          updatedAt: now,
        })
        .where(eq(rooms.id, roomId));
      return { changed: true, event: "matchup:started" };
    }
    if (
      matchup.status === "VOTING" &&
      matchup.votingEndsAt &&
      matchup.votingEndsAt <= now
    ) {
      const state = parseEngine(tournament.engineState);
      const [candidateA, candidateB] = await Promise.all([
        tx
          .select()
          .from(candidates)
          .where(eq(candidates.id, matchup.candidateAId))
          .limit(1)
          .then((rows) => rows[0]),
        tx
          .select()
          .from(candidates)
          .where(eq(candidates.id, matchup.candidateBId))
          .limit(1)
          .then((rows) => rows[0]),
      ]);
      if (!candidateA || !candidateB)
        throw new DomainError(
          "CANDIDATE_MISSING",
          "A matchup candidate is missing.",
          500,
        );
      const ballotRows = await tx
        .select()
        .from(votes)
        .where(eq(votes.matchupId, matchup.id));
      const engineCandidate = (item: typeof candidateA): EngineCandidate => ({
        id: item.id,
        seed: item.seed,
        score: item.scoreTotal,
        supportCount: item.supportCount,
        firstChoiceCount: item.firstChoiceCount,
        nominatorIds: Array.isArray(item.nominatorIds)
          ? item.nominatorIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [],
      });
      const resolution = resolveBallots({
        candidateA: engineCandidate(candidateA),
        candidateB: engineCandidate(candidateB),
        ballots: ballotRows.map((vote) => ({
          participantId: vote.participantId,
          candidateId: vote.candidateId,
          abstained: vote.abstained,
        })),
        roomSeed: state.roomSeed,
        matchupKey: matchup.engineKey,
      });
      const next = advanceTournament(state, resolution);
      const resultEndsAt = new Date(now.getTime() + RESULT_SECONDS * 1000);
      await tx
        .update(matchups)
        .set({
          status: "RESOLVED",
          winnerCandidateId: resolution.winnerId,
          loserCandidateId: resolution.loserId,
          resolvedAt: now,
          resultEndsAt,
          resolution,
        })
        .where(and(eq(matchups.id, matchup.id), eq(matchups.status, "VOTING")));
      await tx
        .update(tournaments)
        .set({
          engineState: next,
          championCandidateId: next.championId,
          updatedAt: now,
        })
        .where(eq(tournaments.id, tournament.id));
      await tx
        .update(candidates)
        .set({
          strikes: next.strikes[resolution.loserId] ?? 1,
          status: matchup.stage === "QUALIFIER" ? "ACTIVE" : "ELIMINATED",
          updatedAt: now,
        })
        .where(eq(candidates.id, resolution.loserId));
      if (matchup.stage === "SPOTLIGHT" && next.stage === "REDEMPTION") {
        const selected = new Set(
          next.pending.flatMap((planned) => [
            planned.candidateAId,
            planned.candidateBId,
          ]),
        );
        const eliminated = next.qualifierLosers.filter(
          (id) => !selected.has(id),
        );
        if (eliminated.length)
          await tx
            .update(candidates)
            .set({ status: "ELIMINATED", updatedAt: now })
            .where(inArray(candidates.id, eliminated));
      }
      if (
        matchup.stage === "REDEMPTION" ||
        matchup.stage === "REDEMPTION_FINAL"
      )
        await tx
          .update(candidates)
          .set({ redemption: true, updatedAt: now })
          .where(eq(candidates.id, resolution.winnerId));
      if (next.stage !== matchup.stage || next.championId)
        await tx
          .update(rounds)
          .set({ status: "COMPLETED", completedAt: now })
          .where(eq(rounds.id, matchup.roundId));
      await tx
        .update(rooms)
        .set({
          state: "MATCHUP_RESULT",
          version: sql`${rooms.version}+1`,
          updatedAt: now,
        })
        .where(eq(rooms.id, roomId));
      await tx
        .insert(auditEvents)
        .values({
          householdId: room.householdId,
          roomId,
          actorType: "SYSTEM",
          eventType: "MATCHUP_RESOLVED",
          metadata: {
            matchupId: matchup.id,
            stage: matchup.stage,
            sequence: matchup.sequence,
            votesA: resolution.votesA,
            votesB: resolution.votesB,
            abstentions: resolution.abstentions,
            tieBreak: resolution.tieBreak,
          },
        });
      return { changed: true, event: "matchup:result" };
    }
    if (
      matchup.status === "RESOLVED" &&
      matchup.resultEndsAt &&
      matchup.resultEndsAt <= now
    ) {
      const state = parseEngine(tournament.engineState);
      await tx
        .update(matchups)
        .set({ advancedAt: now })
        .where(and(eq(matchups.id, matchup.id), isNull(matchups.advancedAt)));
      if (state.championId) {
        await tx
          .update(tournaments)
          .set({ status: "COMPLETED", completedAt: now, updatedAt: now })
          .where(eq(tournaments.id, tournament.id));
        await tx
          .update(candidates)
          .set({ status: "WINNER", updatedAt: now })
          .where(eq(candidates.id, state.championId));
        await tx
          .update(rooms)
          .set({
            state: "WINNER",
            version: sql`${rooms.version}+1`,
            updatedAt: now,
          })
          .where(eq(rooms.id, roomId));
        return { changed: true, event: "room:winner" };
      }
      await createCurrentMatchup(
        tx,
        tournament.id,
        roomId,
        state,
        tournament.voteDurationSeconds,
      );
      return { changed: true, event: "bracket:updated" };
    }
    return { changed: false };
  });
  if (result.event === "room:winner") await ensureRoomHistory(ctx.db, roomId);
  return result;
}

export async function getTournamentData(
  db: Database,
  roomId: string,
  viewerParticipantId?: string,
) {
  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.roomId, roomId))
    .limit(1);
  if (!tournament) return null;
  const state = parseEngine(tournament.engineState);
  const candidateRows = await db
    .select({
      id: candidates.id,
      seed: candidates.seed,
      strikes: candidates.strikes,
      status: candidates.status,
      redemption: candidates.redemption,
      sourceType: candidates.sourceType,
      supportCount: candidates.supportCount,
      title: mediaItems.title,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      runtimeMinutes: mediaItems.runtimeMinutes,
      contentRating: mediaItems.contentRating,
      genres: mediaItems.genres,
      synopsis: mediaItems.synopsis,
      catalogKey: mediaItems.catalogKey,
      posterUrl: mediaItems.posterUrl,
      metadata: mediaItems.metadata,
    })
    .from(candidates)
    .innerJoin(mediaItems, eq(candidates.mediaItemId, mediaItems.id))
    .where(eq(candidates.roomId, roomId));
  const [active] = await db
    .select()
    .from(matchups)
    .where(
      and(
        eq(matchups.tournamentId, tournament.id),
        isNull(matchups.advancedAt),
      ),
    )
    .orderBy(desc(matchups.sequence))
    .limit(1);
  let voteRows: (typeof votes.$inferSelect)[] = [];
  if (active)
    voteRows = await db
      .select()
      .from(votes)
      .where(eq(votes.matchupId, active.id));
  const map = new Map(candidateRows.map((item) => [item.id, item]));
  const media = (id: string) => {
    const item = map.get(id);
    if (!item)
      throw new DomainError(
        "CANDIDATE_MISSING",
        "A tournament candidate is missing.",
        500,
      );
    const metadata =
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : {};
    const availability = MediaAvailabilitySchema.safeParse(
      metadata.availability,
    );
    const local =
      metadata.localAvailability && typeof metadata.localAvailability === "object"
        ? (metadata.localAvailability as Record<string, unknown>)
        : undefined;
    const request =
      metadata.requestAvailability && typeof metadata.requestAvailability === "object"
        ? (metadata.requestAvailability as Record<string, unknown>)
        : undefined;
    const requestStatuses = ["UNKNOWN", "PENDING", "PROCESSING", "PARTIAL", "AVAILABLE", "REQUESTABLE", "UNAVAILABLE"] as const;
    const requestStatus = requestStatuses.find((status) => status === request?.status);
    return {
      id: item.id,
      catalogKey: item.catalogKey,
      title: item.title,
      mediaType: item.mediaType,
      releaseYear: item.releaseYear,
      runtimeMinutes: item.runtimeMinutes ?? 0,
      contentRating: item.contentRating ?? "Unrated",
      genres: Array.isArray(item.genres)
        ? item.genres.filter(
            (genre): genre is string => typeof genre === "string",
          )
        : [],
      synopsis: item.synopsis,
      posterUrl: item.posterUrl,
      ...(availability.success ? { availability: availability.data } : {}),
      ...(local && typeof local.available === "boolean"
        ? {
            localAvailability: {
              available: local.available,
              plexUrl: typeof local.plexUrl === "string" ? local.plexUrl : null,
              libraryTitle: typeof local.libraryTitle === "string" ? local.libraryTitle : null,
              episodeCount: typeof local.episodeCount === "number" ? local.episodeCount : null,
            },
          }
        : {}),
      ...(requestStatus && request && typeof request.requestable === "boolean"
        ? { requestAvailability: {
            status: requestStatus,
            requestable: request.requestable,
            requestUrl: typeof request.requestUrl === "string" ? request.requestUrl : null,
          } }
        : {}),
      seed: item.seed,
      strikes: item.strikes,
      redemption: item.redemption,
      sourceType: item.sourceType,
      supportCount: item.supportCount,
    };
  };
  const ownVote =
    viewerParticipantId && active
      ? voteRows.find((vote) => vote.participantId === viewerParticipantId)
      : undefined;
  const rawResolution = active?.resolution as
    | Partial<Omit<EngineResult, "matchup">>
    | undefined;
  const resolution =
    active?.status === "RESOLVED" &&
    active.winnerCandidateId &&
    active.loserCandidateId
      ? {
          winnerId: active.winnerCandidateId,
          loserId: active.loserCandidateId,
          votesA: Number(rawResolution?.votesA ?? 0),
          votesB: Number(rawResolution?.votesB ?? 0),
          abstentions: Number(rawResolution?.abstentions ?? 0),
          tieBreak: rawResolution?.tieBreak ?? null,
        }
      : null;
  const tasteSnapshot = tournament.status === "COMPLETED" ? await getRoomTasteSnapshot(db, roomId) : null;
  const finalResult = [...state.completed]
    .reverse()
    .find((result) => result.matchup.stage === "CHAMPIONSHIP_FINAL");
  const bronzeResults = state.completed.filter((result) =>
    result.matchup.stage === "CHAMPIONSHIP_SEMI",
  );
  const fallbackBronzeResults = bronzeResults.length
    ? bronzeResults
    : state.completed.filter((result) =>
        result.matchup.stage === "CHAMPIONSHIP_PLAY_IN",
      );
  const podium = finalResult
    ? [
        { ...media(finalResult.winnerId), placement: 1 as const },
        { ...media(finalResult.loserId), placement: 2 as const },
        ...fallbackBronzeResults
          .filter(
            (result) =>
              result.loserId !== finalResult.winnerId &&
              result.loserId !== finalResult.loserId,
          )
          .map((result) => ({ ...media(result.loserId), placement: 3 as const }))
          .sort((a, b) => a.seed - b.seed)
          .slice(0, 2),
      ]
    : [];
  return {
    format: tournament.format as TournamentFormat,
    totalMatchups: state.format === 8 ? 9 : state.format === 12 ? 15 : 19,
    completedMatchups: state.completed.length,
    stage: state.stage,
    status: tournament.status,
    tasteSnapshot,
    champion: state.championId ? media(state.championId) : null,
    podium,
    activeMatchup: active
      ? {
          id: active.id,
          engineKey: active.engineKey,
          sequence: active.sequence,
          stage: active.stage,
          status: active.status,
          candidateA: media(active.candidateAId),
          candidateB: media(active.candidateBId),
          deadline:
            active.status === "INTRO"
              ? active.introEndsAt.toISOString()
              : active.status === "VOTING"
                ? (active.votingEndsAt?.toISOString() ?? null)
                : (active.resultEndsAt?.toISOString() ?? null),
          votesReceived: voteRows.length,
          eligibleVoters: Array.isArray(active.eligibleParticipantIds)
            ? active.eligibleParticipantIds.length
            : 0,
          ownVote: ownVote
            ? { candidateId: ownVote.candidateId, abstained: ownVote.abstained }
            : null,
          resolution,
        }
      : null,
    bracket: state.completed.map((result) => ({
      key: result.matchup.key,
      stage: result.matchup.stage,
      sequence: result.matchup.sequence,
      candidateAId: result.matchup.candidateAId,
      candidateBId: result.matchup.candidateBId,
      winnerId: result.winnerId,
      loserId: result.loserId,
      winnerTitle: media(result.winnerId).title,
      loserTitle: media(result.loserId).title,
    })),
  };
}
