import { describe, expect, it } from "vitest";
import { CastLaunchEnvelopeSchema, DisplaySceneSchema } from "./index.js";

describe("Cast launch protocol", () => {
  it("accepts only the versioned opaque launch envelope", () => {
    expect(
      CastLaunchEnvelopeSchema.safeParse({
        type: "WATCH_BRACKET_LAUNCH",
        schemaVersion: 1,
        launchToken: "a".repeat(43),
      }).success,
    ).toBe(true);
    expect(
      CastLaunchEnvelopeSchema.safeParse({
        type: "WATCH_BRACKET_LAUNCH",
        schemaVersion: 2,
        launchToken: "a".repeat(43),
      }).success,
    ).toBe(false);
  });

  it("validates a private nomination progress scene without nominee titles", () => {
    const scene = {
      type: "NOMINATION_PROGRESS",
      roomName: "Friday",
      roomCode: "ABC123",
      deadline: new Date().toISOString(),
      submittedParticipants: 2,
      lockedParticipants: 1,
      totalParticipants: 4,
      revealed: false,
      candidates: [],
    };
    expect(DisplaySceneSchema.parse(scene)).toEqual(scene);
  });

  it("validates the complete semantic tournament scene sequence", () => {
    const candidateA = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Aurora Drift",
      mediaType: "MOVIE",
      releaseYear: 2024,
      runtimeMinutes: 112,
      contentRating: "PG-13",
      genres: ["Science Fiction"],
      seed: 1,
      strikes: 0,
      redemption: false,
    };
    const candidateB = {
      ...candidateA,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Kestrel Station",
      seed: 8,
      strikes: 1,
      redemption: true,
    };
    const deadline = new Date().toISOString();
    expect(
      DisplaySceneSchema.safeParse({
        type: "MATCHUP_INTRO",
        roomName: "Friday",
        stage: "REDEMPTION",
        matchupNumber: 7,
        totalMatchups: 9,
        candidateA,
        candidateB,
        deadline,
      }).success,
    ).toBe(true);
    expect(
      DisplaySceneSchema.safeParse({
        type: "MATCHUP_VOTING",
        roomName: "Friday",
        stage: "REDEMPTION",
        matchupNumber: 7,
        totalMatchups: 9,
        candidateA,
        candidateB,
        deadline,
        votesReceived: 2,
        eligibleVoters: 4,
      }).success,
    ).toBe(true);
    expect(
      DisplaySceneSchema.safeParse({
        type: "MATCHUP_RESULT",
        roomName: "Friday",
        stage: "REDEMPTION",
        matchupNumber: 7,
        totalMatchups: 9,
        winner: candidateB,
        loser: candidateA,
        votesWinner: 3,
        votesLoser: 1,
        abstentions: 0,
        tieBreak: null,
        deadline,
      }).success,
    ).toBe(true);
    expect(
      DisplaySceneSchema.safeParse({
        type: "WINNER",
        roomName: "Friday",
        winner: candidateB,
        podium: [
          { ...candidateB, placement: 1 },
          { ...candidateA, placement: 2 },
          { ...candidateA, placement: 3 },
        ],
        path: [{ stage: "CHAMPIONSHIP_FINAL", opponentTitle: "Aurora Drift" }],
        actionUrl: "https://example.com/winner",
        actionLabel: "View winner",
        tasteSnapshot: null,
      }).success,
    ).toBe(true);
  });
});
