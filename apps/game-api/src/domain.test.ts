import { describe, expect, it } from "vitest";
import { acceptsLateVoters } from "./domain.js";

describe("late voter admission", () => {
  it.each([
    "NOMINATIONS_LOCKED",
    "MATCHUP_INTRO",
    "VOTING",
    "MATCHUP_RESULT",
    "WINNER",
  ])("allows joining during %s", (state) => {
    expect(acceptsLateVoters(state)).toBe(true);
  });

  it.each(["LOBBY", "NOMINATING", "EXPIRED"])(
    "does not classify %s as a late-voter state",
    (state) => {
      expect(acceptsLateVoters(state)).toBe(false);
    },
  );
});
