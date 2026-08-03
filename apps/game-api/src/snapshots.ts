import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@watch-bracket/db";
import {
  displaySessions,
  mediaItems,
  participants,
  rooms,
  submissions,
} from "@watch-bracket/db";
import type { DisplayScene } from "@watch-bracket/display-protocol";
import {
  HouseRulesSchema,
  type CatalogItem,
  type RoomSnapshot,
} from "@watch-bracket/realtime-protocol";
import { MediaAvailabilitySchema } from "@watch-bracket/provider-contracts";
import { DomainError } from "./domain.js";
import { getTournamentData } from "./tournament.js";

export type Presence = { participantIds: Set<string>; displayIds: Set<string> };

export async function getSnapshot(
  db: Database,
  roomId: string,
  viewer: RoomSnapshot["viewer"],
  presence: Presence,
  viewerParticipantId?: string,
): Promise<RoomSnapshot> {
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room) throw new DomainError("ROOM_NOT_FOUND", "Room not found.", 404);
  const people = await db
    .select()
    .from(participants)
    .where(
      and(eq(participants.roomId, roomId), isNull(participants.removedAt)),
    );
  const displays =
    viewer === "DISPLAY"
      ? []
      : await db
          .select()
          .from(displaySessions)
          .where(
            and(
              eq(displaySessions.roomId, roomId),
              isNull(displaySessions.revokedAt),
              gt(displaySessions.expiresAt, new Date()),
            ),
          );
  const selected = await db
    .select({
      participantId: submissions.participantId,
      rank: submissions.rank,
      catalogKey: mediaItems.catalogKey,
      mediaType: mediaItems.mediaType,
      title: mediaItems.title,
      releaseYear: mediaItems.releaseYear,
      runtimeMinutes: mediaItems.runtimeMinutes,
      contentRating: mediaItems.contentRating,
      genres: mediaItems.genres,
      synopsis: mediaItems.synopsis,
      posterUrl: mediaItems.posterUrl,
      metadata: mediaItems.metadata,
    })
    .from(submissions)
    .innerJoin(mediaItems, eq(submissions.mediaItemId, mediaItems.id))
    .where(eq(submissions.roomId, roomId));
  const asCatalogItem = (item: (typeof selected)[number]): CatalogItem => {
    const metadata =
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : {};
    const availability = MediaAvailabilitySchema.safeParse(
      metadata.availability,
    );
    const local = parseLocalAvailability(metadata.localAvailability);
    const request = parseRequestAvailability(metadata.requestAvailability);
    return {
      catalogKey: item.catalogKey,
      mediaType: item.mediaType,
      title: item.title,
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
      ...(local ? { localAvailability: local } : {}),
      ...(request ? { requestAvailability: request } : {}),
    };
  };
  const byParticipant = new Map<string, typeof selected>();
  for (const item of selected)
    byParticipant.set(item.participantId, [
      ...(byParticipant.get(item.participantId) ?? []),
      item,
    ]);
  const revealed =
    room.state === "NOMINATIONS_LOCKED" || Boolean(room.nominationsRevealedAt);
  const tournament = await getTournamentData(
    db,
    roomId,
    viewer === "DISPLAY" ? undefined : viewerParticipantId,
  );
  const candidateMap = new Map<
    string,
    CatalogItem & { supportCount: number; bestRank: number }
  >();
  if (revealed)
    for (const item of selected) {
      const current = candidateMap.get(item.catalogKey);
      if (current) {
        current.supportCount += 1;
        current.bestRank = Math.min(current.bestRank, item.rank);
      } else
        candidateMap.set(item.catalogKey, {
          ...asCatalogItem(item),
          supportCount: 1,
          bestRank: item.rank,
        });
    }
  return {
    roomId: room.id,
    name: room.name,
    code: room.code,
    state: room.state,
    locked: Boolean(room.lockedAt),
    sequence: room.version,
    viewer,
    viewerParticipantId:
      viewer === "DISPLAY" ? null : (viewerParticipantId ?? null),
    viewerReady:
      people.find((person) => person.id === viewerParticipantId)?.ready ??
      false,
    participants: people.map((person) => ({
      ...(viewer === "DISPLAY" ? {} : { id: person.id }),
      nickname: person.displayNickname,
      role:
        person.role === "HOST" ? ("HOST" as const) : ("PARTICIPANT" as const),
      connected: presence.participantIds.has(person.id),
    })),
    displays: displays.map((display) => ({
      id: display.id,
      name: display.displayName,
      kind: display.kind,
      connected: presence.displayIds.has(display.id),
    })),
    rules: HouseRulesSchema.parse(room.rules),
    nominationDeadline: room.nominationDeadline?.toISOString() ?? null,
    nominationAutoStartAt: room.nominationAutoStartAt?.toISOString() ?? null,
    nominationsRevealed: revealed,
    nominationProgress: {
      submittedParticipants: [...byParticipant.values()].filter(
        (items) => new Set(items.map((item) => item.rank)).size === 2,
      ).length,
      lockedParticipants: people.filter((person) => person.ready).length,
      totalParticipants: people.length,
    },
    ownSubmissions: viewerParticipantId
      ? (byParticipant.get(viewerParticipantId) ?? [])
          .map((item) => ({ ...asCatalogItem(item), rank: item.rank }))
          .sort((a, b) => a.rank - b.rank)
      : [],
    candidates: [...candidateMap.values()]
      .map((item) => ({ ...item, bestRank: item.bestRank }))
      .sort(
        (a, b) =>
          b.supportCount - a.supportCount ||
          a.bestRank - b.bestRank ||
          a.title.localeCompare(b.title),
      ),
    tournament,
  };
}

function parseLocalAvailability(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.available !== "boolean") return undefined;
  return {
    available: item.available,
    plexUrl: typeof item.plexUrl === "string" ? item.plexUrl : null,
    libraryTitle:
      typeof item.libraryTitle === "string" ? item.libraryTitle : null,
    episodeCount:
      typeof item.episodeCount === "number" ? item.episodeCount : null,
  };
}
function parseRequestAvailability(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const statuses = [
    "UNKNOWN",
    "PENDING",
    "PROCESSING",
    "PARTIAL",
    "AVAILABLE",
    "REQUESTABLE",
    "UNAVAILABLE",
  ] as const;
  const status = statuses.find((entry) => entry === item.status);
  if (!status || typeof item.requestable !== "boolean") return undefined;
  return {
    status,
    requestable: item.requestable,
    requestUrl: typeof item.requestUrl === "string" ? item.requestUrl : null,
  };
}

export function toDisplayScene(
  snapshot: RoomSnapshot,
  publicAppUrl: string,
  winnerDisplayMode: "AUTO" | "PODIUM" | "BRACKET" = "AUTO",
): DisplayScene {
  if (snapshot.state === "LOBBY" || snapshot.state === "EXPIRED")
    return {
      type: "LOBBY",
      roomName: snapshot.name,
      roomCode: snapshot.code,
      joinUrl: `${publicAppUrl}/join/${snapshot.code}`,
      locked: snapshot.locked,
      participants: snapshot.participants.map(
        ({ nickname, role, connected }) => ({ nickname, role, connected }),
      ),
    };
  if (
    snapshot.state === "NOMINATING" ||
    snapshot.state === "NOMINATIONS_LOCKED"
  )
    return {
      type: "NOMINATION_PROGRESS",
      roomName: snapshot.name,
      roomCode: snapshot.code,
      deadline: snapshot.nominationDeadline,
      autoStartAt: snapshot.nominationAutoStartAt,
      submittedParticipants: snapshot.nominationProgress.submittedParticipants,
      lockedParticipants: snapshot.nominationProgress.lockedParticipants,
      totalParticipants: snapshot.nominationProgress.totalParticipants,
      revealed: snapshot.nominationsRevealed,
      candidates: snapshot.candidates.map(
        ({ title, mediaType, releaseYear, supportCount }) => ({
          title,
          mediaType,
          releaseYear,
          supportCount,
        }),
      ),
    };
  const tournament = snapshot.tournament;
  if (!tournament)
    throw new DomainError(
      "TOURNAMENT_STATE_INVALID",
      "Tournament presentation is unavailable.",
      500,
    );
  const matchup = tournament.activeMatchup;
  const sceneCandidate = (item: NonNullable<typeof matchup>["candidateA"]) => ({
    id: item.id,
    title: item.title,
    mediaType: item.mediaType,
    releaseYear: item.releaseYear,
    runtimeMinutes: item.runtimeMinutes,
    contentRating: item.contentRating,
    genres: item.genres,
    posterUrl: item.posterUrl,
    availability: item.availability,
    localAvailability: item.localAvailability,
    requestAvailability: item.requestAvailability,
    seed: item.seed,
    strikes: item.strikes,
    redemption: item.redemption,
  });
  if (snapshot.state === "WINNER" && tournament.champion) {
    const champion = tournament.champion;
    const tmdbId = champion.catalogKey.split(":").at(-1);
    const actionUrl = champion.localAvailability?.plexUrl ?? champion.requestAvailability?.requestUrl ?? champion.availability?.link ?? `https://www.themoviedb.org/${champion.mediaType === "MOVIE" ? "movie" : "tv"}/${tmdbId}`;
    const actionLabel = champion.localAvailability?.plexUrl ? "Watch now on Plex" : champion.requestAvailability?.requestUrl ? "Open in Jellyseerr to request" : champion.availability?.link ? "View streaming options" : "View title details";
    return {
      type: "WINNER",
      roomName: snapshot.name,
      roomCode: snapshot.code,
      joinUrl: `${publicAppUrl}/join/${snapshot.code}`,
      displayMode: winnerDisplayMode,
      winner: sceneCandidate(champion),
      podium: tournament.podium.map((item) => ({
        ...sceneCandidate(item),
        placement: item.placement,
      })),
      path: tournament.bracket
        .filter((result) => result.winnerId === champion.id)
        .map((result) => ({
          stage: result.stage,
          opponentTitle: result.loserTitle,
        })),
      bracket: tournament.bracket.map((result) => ({
        key: result.key,
        stage: result.stage,
        sequence: result.sequence,
        winnerTitle: result.winnerTitle,
        loserTitle: result.loserTitle,
        winnerVotes: result.winnerVotes,
        loserVotes: result.loserVotes,
        abstentions: result.abstentions,
      })),
      actionUrl,
      actionLabel,
      tasteSnapshot: tournament.tasteSnapshot,
    };
  }
  if (!matchup)
    throw new DomainError(
      "MATCHUP_MISSING",
      "The active matchup is unavailable.",
      500,
    );
  const base = {
    roomName: snapshot.name,
    roomCode: snapshot.code,
    joinUrl: `${publicAppUrl}/join/${snapshot.code}`,
    stage: matchup.stage,
    matchupNumber: matchup.sequence,
    totalMatchups: tournament.totalMatchups,
    candidateA: sceneCandidate(matchup.candidateA),
    candidateB: sceneCandidate(matchup.candidateB),
  };
  if (matchup.status === "INTRO")
    return { type: "MATCHUP_INTRO", ...base, deadline: matchup.deadline };
  if (matchup.status === "VOTING")
    return {
      type: "MATCHUP_VOTING",
      ...base,
      deadline: matchup.deadline!,
      votesReceived: matchup.votesReceived,
      eligibleVoters: matchup.eligibleVoters,
    };
  const resolution = matchup.resolution;
  if (!resolution)
    throw new DomainError(
      "MATCHUP_RESULT_MISSING",
      "The matchup result is unavailable.",
      500,
    );
  const winner =
    resolution.winnerId === matchup.candidateA.id
      ? matchup.candidateA
      : matchup.candidateB;
  const loser =
    resolution.loserId === matchup.candidateA.id
      ? matchup.candidateA
      : matchup.candidateB;
  const winnerIsA = winner.id === matchup.candidateA.id;
  return {
    type: "MATCHUP_RESULT",
    roomName: snapshot.name,
    roomCode: snapshot.code,
    joinUrl: `${publicAppUrl}/join/${snapshot.code}`,
    stage: matchup.stage,
    matchupNumber: matchup.sequence,
    totalMatchups: tournament.totalMatchups,
    winner: sceneCandidate(winner),
    loser: sceneCandidate(loser),
    votesWinner: winnerIsA ? resolution.votesA : resolution.votesB,
    votesLoser: winnerIsA ? resolution.votesB : resolution.votesA,
    abstentions: resolution.abstentions,
    tieBreak: resolution.tieBreak,
    deadline: matchup.deadline,
  };
}
