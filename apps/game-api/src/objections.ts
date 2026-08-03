import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  auditEvents,
  candidates,
  participants,
  rooms,
  tournaments,
} from "@watch-bracket/db";
import type { TournamentState } from "@watch-bracket/tournament-engine";
import type { DomainContext } from "./domain.js";
import { DomainError } from "./domain.js";

export type ObjectionBallot = {
  participantId: string;
  goldCandidateId: string;
  silverCandidateId: string;
  submittedAt: string;
};

export type ObjectionResult = {
  candidateId: string;
  placement: 1 | 2 | 3;
  goldVotes: number;
  silverVotes: number;
  points: number;
};

export type ObjectionState = {
  version: 1;
  status: "OPEN" | "COMPLETED";
  objectorParticipantId: string;
  objectorNickname: string;
  candidateIds: [string, string, string];
  originalChampionId: string;
  eligibleParticipantIds: string[];
  ballots: ObjectionBallot[];
  openedAt: string;
  completedAt: string | null;
  result: ObjectionResult[] | null;
};

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export function parseObjectionState(value: unknown): ObjectionState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<ObjectionState>;
  if (
    state.version !== 1 ||
    (state.status !== "OPEN" && state.status !== "COMPLETED") ||
    typeof state.objectorParticipantId !== "string" ||
    typeof state.objectorNickname !== "string" ||
    !Array.isArray(state.candidateIds) ||
    state.candidateIds.length !== 3 ||
    !state.candidateIds.every((id) => typeof id === "string") ||
    typeof state.originalChampionId !== "string" ||
    !Array.isArray(state.eligibleParticipantIds) ||
    !Array.isArray(state.ballots) ||
    typeof state.openedAt !== "string"
  )
    throw new DomainError(
      "OBJECTION_STATE_INVALID",
      "The stored objection round is invalid.",
      500,
    );
  return state as ObjectionState;
}

export function resolveObjectionBallots(
  candidateIds: [string, string, string],
  ballots: ObjectionBallot[],
): ObjectionResult[] {
  const originalPlacement = new Map(
    candidateIds.map((candidateId, index) => [candidateId, index + 1]),
  );
  return candidateIds
    .map((candidateId) => {
      const goldVotes = ballots.filter(
        (ballot) => ballot.goldCandidateId === candidateId,
      ).length;
      const silverVotes = ballots.filter(
        (ballot) => ballot.silverCandidateId === candidateId,
      ).length;
      return {
        candidateId,
        goldVotes,
        silverVotes,
        points: goldVotes * 2 + silverVotes,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goldVotes - a.goldVotes ||
        originalPlacement.get(a.candidateId)! -
          originalPlacement.get(b.candidateId)!,
    )
    .map((entry, index) => ({
      ...entry,
      placement: (index + 1) as 1 | 2 | 3,
    }));
}

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

function podiumIds(state: TournamentState): [string, string, string] {
  const final = [...state.completed]
    .reverse()
    .find((entry) => entry.matchup.stage === "CHAMPIONSHIP_FINAL");
  if (!final)
    throw new DomainError(
      "OBJECTION_NOT_READY",
      "The podium is not ready for an objection.",
      409,
    );
  const bronzePool = state.completed.filter(
    (entry) => entry.matchup.stage === "CHAMPIONSHIP_SEMI",
  );
  const fallbackPool = bronzePool.length
    ? bronzePool
    : state.completed.filter(
        (entry) => entry.matchup.stage === "CHAMPIONSHIP_PLAY_IN",
      );
  const bronze = fallbackPool
    .map((entry) => entry.loserId)
    .find(
      (candidateId) =>
        candidateId !== final.winnerId && candidateId !== final.loserId,
    );
  if (!bronze)
    throw new DomainError(
      "OBJECTION_NOT_READY",
      "Three podium finalists are required for an objection.",
      409,
    );
  return [final.winnerId, final.loserId, bronze];
}

export async function openObjection(
  ctx: DomainContext,
  roomId: string,
  participantId: string,
  connectedParticipantIds: Iterable<string>,
) {
  return ctx.db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .for("update")
      .limit(1);
    if (!room || room.state !== "WINNER")
      throw new DomainError(
        "OBJECTION_NOT_READY",
        "An objection can only be raised after the podium is awarded.",
        409,
      );
    const [objector] = await tx
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.id, participantId),
          eq(participants.roomId, roomId),
          isNull(participants.removedAt),
        ),
      )
      .limit(1);
    if (!objector)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "Join this room before raising an objection.",
        401,
      );
    const [tournament] = await tx
      .select()
      .from(tournaments)
      .where(eq(tournaments.roomId, roomId))
      .for("update")
      .limit(1);
    if (!tournament || tournament.status !== "COMPLETED")
      throw new DomainError(
        "OBJECTION_NOT_READY",
        "The tournament has not finished yet.",
        409,
      );
    if (parseObjectionState(tournament.objectionState))
      throw new DomainError(
        "OBJECTION_ALREADY_USED",
        "This room has already used its one objection.",
        409,
      );
    const activePeople = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.roomId, roomId),
          isNull(participants.removedAt),
        ),
      );
    const connected = new Set(connectedParticipantIds);
    const eligibleParticipantIds = activePeople
      .map((person) => person.id)
      .filter((id) => connected.has(id) || id === participantId);
    const candidateIds = podiumIds(parseEngine(tournament.engineState));
    const objection: ObjectionState = {
      version: 1,
      status: "OPEN",
      objectorParticipantId: participantId,
      objectorNickname: objector.displayNickname,
      candidateIds,
      originalChampionId: tournament.championCandidateId ?? candidateIds[0],
      eligibleParticipantIds,
      ballots: [],
      openedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
    };
    await tx
      .update(tournaments)
      .set({ objectionState: objection, updatedAt: new Date() })
      .where(eq(tournaments.id, tournament.id));
    await tx
      .update(rooms)
      .set({ version: sql`${rooms.version}+1`, updatedAt: new Date() })
      .where(eq(rooms.id, roomId));
    await tx.insert(auditEvents).values({
      householdId: room.householdId,
      roomId,
      actorType: "PARTICIPANT",
      actorId: participantId,
      eventType: "PODIUM_OBJECTION_RAISED",
      metadata: { eligibleVoters: eligibleParticipantIds.length },
    });
    return objection;
  });
}

export async function submitObjectionBallot(
  ctx: DomainContext,
  roomId: string,
  participantId: string,
  input: { goldCandidateId: string; silverCandidateId: string },
) {
  if (input.goldCandidateId === input.silverCandidateId)
    throw new DomainError(
      "OBJECTION_BALLOT_INVALID",
      "Gold and Silver must be different titles.",
      400,
    );
  const outcome = await ctx.db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .for("update")
      .limit(1);
    const [tournament] = await tx
      .select()
      .from(tournaments)
      .where(eq(tournaments.roomId, roomId))
      .for("update")
      .limit(1);
    const objection = parseObjectionState(tournament?.objectionState);
    if (!room || room.state !== "WINNER" || !tournament || !objection)
      throw new DomainError(
        "OBJECTION_NOT_READY",
        "There is no objection ballot open in this room.",
        409,
      );
    if (objection.status !== "OPEN")
      throw new DomainError(
        "OBJECTION_CLOSED",
        "The objection ballot has already been decided.",
        409,
      );
    if (!objection.eligibleParticipantIds.includes(participantId))
      throw new DomainError(
        "OBJECTION_NOT_ELIGIBLE",
        "Only players present when the objection was raised can vote.",
        403,
      );
    if (
      !objection.candidateIds.includes(input.goldCandidateId) ||
      !objection.candidateIds.includes(input.silverCandidateId)
    )
      throw new DomainError(
        "OBJECTION_BALLOT_INVALID",
        "Choose Gold and Silver from the podium finalists.",
        400,
      );
    const ballot: ObjectionBallot = {
      participantId,
      ...input,
      submittedAt: new Date().toISOString(),
    };
    const ballots = [
      ...objection.ballots.filter(
        (entry) => entry.participantId !== participantId,
      ),
      ballot,
    ];
    const complete = ballots.length >= objection.eligibleParticipantIds.length;
    const result = complete
      ? resolveObjectionBallots(objection.candidateIds, ballots)
      : null;
    const next: ObjectionState = {
      ...objection,
      status: complete ? "COMPLETED" : "OPEN",
      ballots,
      completedAt: complete ? new Date().toISOString() : null,
      result,
    };
    const championId = result?.[0]?.candidateId;
    const engine = parseEngine(tournament.engineState);
    await tx
      .update(tournaments)
      .set({
        objectionState: next,
        ...(championId
          ? {
              championCandidateId: championId,
              engineState: { ...engine, championId },
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournament.id));
    if (championId) {
      await tx
        .update(candidates)
        .set({ status: "ELIMINATED", updatedAt: new Date() })
        .where(
          and(
            inArray(candidates.id, strings(objection.candidateIds)),
            eq(candidates.status, "WINNER"),
          ),
        );
      await tx
        .update(candidates)
        .set({ status: "WINNER", updatedAt: new Date() })
        .where(eq(candidates.id, championId));
    }
    await tx
      .update(rooms)
      .set({ version: sql`${rooms.version}+1`, updatedAt: new Date() })
      .where(eq(rooms.id, roomId));
    await tx.insert(auditEvents).values({
      householdId: room.householdId,
      roomId,
      actorType: "PARTICIPANT",
      actorId: participantId,
      eventType: complete
        ? "PODIUM_OBJECTION_DECIDED"
        : "PODIUM_OBJECTION_BALLOT_CAST",
      metadata: {
        ballotsReceived: ballots.length,
        eligibleVoters: objection.eligibleParticipantIds.length,
        ...(championId
          ? {
              championId,
              championChanged: championId !== objection.originalChampionId,
            }
          : {}),
      },
    });
    return { objection: next, completed: complete, championId };
  });
  return outcome;
}
