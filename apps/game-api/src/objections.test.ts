import { describe, expect, it } from "vitest";
import {
  resolveObjectionBallots,
  type ObjectionBallot,
} from "./objections.js";

const candidates = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as [string, string, string];

const ballot = (
  participantId: string,
  goldCandidateId: string,
  silverCandidateId: string,
): ObjectionBallot => ({
  participantId,
  goldCandidateId,
  silverCandidateId,
  submittedAt: "2026-08-03T12:00:00.000Z",
});

describe("podium objection scoring", () => {
  it("weights Gold twice as much as Silver", () => {
    const result = resolveObjectionBallots(candidates, [
      ballot("one", candidates[1], candidates[0]),
      ballot("two", candidates[1], candidates[2]),
      ballot("three", candidates[2], candidates[1]),
    ]);
    expect(result).toEqual([
      { candidateId: candidates[1], placement: 1, goldVotes: 2, silverVotes: 1, points: 5 },
      { candidateId: candidates[2], placement: 2, goldVotes: 1, silverVotes: 1, points: 3 },
      { candidateId: candidates[0], placement: 3, goldVotes: 0, silverVotes: 1, points: 1 },
    ]);
  });

  it("breaks point ties by Gold votes, then the original podium order", () => {
    const goldTieBreak = resolveObjectionBallots(candidates, [
      ballot("one", candidates[1], candidates[0]),
      ballot("two", candidates[2], candidates[0]),
    ]);
    expect(goldTieBreak.map((entry) => entry.candidateId)).toEqual([
      candidates[1],
      candidates[2],
      candidates[0],
    ]);
    expect(resolveObjectionBallots(candidates, []).map((entry) => entry.candidateId)).toEqual(candidates);
  });
});
