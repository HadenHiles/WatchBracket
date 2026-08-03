"use client";
import { useEffect, useState } from "react";
import { RoomDisplay } from "@watch-bracket/display-ui";
import type { DisplayScene } from "@watch-bracket/display-protocol";
import { BrandLogo } from "../../../components/brand-logo";

const candidateA = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Aurora Drift",
  mediaType: "MOVIE" as const,
  releaseYear: 2024,
  runtimeMinutes: 112,
  contentRating: "PG-13",
  genres: ["Science Fiction", "Adventure"],
  seed: 1,
  strikes: 0,
  redemption: false,
};
const candidateB = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "The Quietest Heist",
  mediaType: "MOVIE" as const,
  releaseYear: 2024,
  runtimeMinutes: 103,
  contentRating: "PG-13",
  genres: ["Comedy", "Crime"],
  seed: 8,
  strikes: 1,
  redemption: true,
};
const candidateC = {
  ...candidateA,
  id: "33333333-3333-4333-8333-333333333333",
  title: "Kestrel Station",
  seed: 4,
};
function fixture(mode: string): DisplayScene {
  const deadline = new Date(Date.now() + 83_000).toISOString();
  const roomIdentity = {
    roomName: "Friday Movie Night",
    roomCode: "7K9MQR",
    joinUrl: "https://vote.famflix.live/join/7K9MQR",
  };
  if (mode === "nominations")
    return {
      type: "NOMINATION_PROGRESS",
      roomName: "Friday Movie Night",
      roomCode: "7K9MQR",
      deadline,
      autoStartAt: null,
      submittedParticipants: 2,
      lockedParticipants: 1,
      totalParticipants: 3,
      revealed: false,
      candidates: [],
    };
  if (mode === "intro")
    return {
      type: "MATCHUP_INTRO",
      ...roomIdentity,
      stage: "REDEMPTION",
      matchupNumber: 7,
      totalMatchups: 9,
      candidateA,
      candidateB,
      deadline,
    };
  if (mode === "voting")
    return {
      type: "MATCHUP_VOTING",
      ...roomIdentity,
      stage: "REDEMPTION",
      matchupNumber: 7,
      totalMatchups: 9,
      candidateA,
      candidateB,
      deadline,
      votesReceived: 2,
      eligibleVoters: 4,
    };
  if (mode === "result")
    return {
      type: "MATCHUP_RESULT",
      ...roomIdentity,
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
    };
  if (["winner", "bracket", "objection", "objection-result"].includes(mode))
    return {
      type: "WINNER",
      ...roomIdentity,
      displayMode: mode === "bracket" ? "BRACKET" : "AUTO",
      winner: mode === "objection-result" ? candidateA : { ...candidateB, strikes: 1 },
      objection: mode === "objection"
        ? { status: "OPEN", objectorNickname: "Maya", eligibleVoters: 4, ballotsReceived: 2, championChanged: null, candidates: [candidateB, candidateA, candidateC].map((candidate) => ({ ...candidate, goldVotes: null, silverVotes: null, points: null, finalPlacement: null })) }
        : mode === "objection-result"
          ? { status: "COMPLETED", objectorNickname: "Maya", eligibleVoters: 4, ballotsReceived: 4, championChanged: true, candidates: [{ ...candidateB, goldVotes: 1, silverVotes: 1, points: 3, finalPlacement: 2 as const }, { ...candidateA, goldVotes: 2, silverVotes: 2, points: 6, finalPlacement: 1 as const }, { ...candidateC, goldVotes: 1, silverVotes: 1, points: 3, finalPlacement: 3 as const }] }
          : null,
      podium: mode === "objection-result"
        ? [{ ...candidateA, placement: 1 }, { ...candidateB, strikes: 1, placement: 2 }, { ...candidateC, placement: 3 }]
        : [{ ...candidateB, strikes: 1, placement: 1 }, { ...candidateA, placement: 2 }, { ...candidateC, placement: 3 }],
      path: [
        { stage: "QUALIFIER", opponentTitle: "Moonlight Market" },
        { stage: "REDEMPTION", opponentTitle: "Aurora Drift" },
        { stage: "CHAMPIONSHIP_FINAL", opponentTitle: "Kestrel Station" },
      ],
      bracket: [
        { key: "q1", stage: "QUALIFIER", sequence: 1, winnerTitle: "Aurora Drift", loserTitle: "Moonlight Market", winnerVotes: 3, loserVotes: 1, abstentions: 0 },
        { key: "q2", stage: "QUALIFIER", sequence: 2, winnerTitle: "Kestrel Station", loserTitle: "Crimson Relay", winnerVotes: 2, loserVotes: 1, abstentions: 1 },
        { key: "q3", stage: "QUALIFIER", sequence: 3, winnerTitle: "Signal Fire", loserTitle: "Night Shift", winnerVotes: 4, loserVotes: 0, abstentions: 0 },
        { key: "q4", stage: "QUALIFIER", sequence: 4, winnerTitle: "Velvet Orbit", loserTitle: "Last Stop", winnerVotes: 3, loserVotes: 1, abstentions: 0 },
        { key: "q5", stage: "QUALIFIER", sequence: 5, winnerTitle: "Deep Freeze", loserTitle: "Paper Moon", winnerVotes: 2, loserVotes: 2, abstentions: 0 },
        { key: "q6", stage: "QUALIFIER", sequence: 6, winnerTitle: "Arcade Hearts", loserTitle: "The Long Way", winnerVotes: 3, loserVotes: 1, abstentions: 0 },
        { key: "q7", stage: "QUALIFIER", sequence: 7, winnerTitle: "Blue Hour", loserTitle: "Open Water", winnerVotes: 3, loserVotes: 0, abstentions: 1 },
        { key: "q8", stage: "QUALIFIER", sequence: 8, winnerTitle: "Good Company", loserTitle: "Static Summer", winnerVotes: 4, loserVotes: 0, abstentions: 0 },
        { key: "r1", stage: "REDEMPTION", sequence: 9, winnerTitle: "The Quietest Heist", loserTitle: "Aurora Drift", winnerVotes: 3, loserVotes: 1, abstentions: 0 },
        { key: "f1", stage: "CHAMPIONSHIP_FINAL", sequence: 10, winnerTitle: "The Quietest Heist", loserTitle: "Kestrel Station", winnerVotes: 3, loserVotes: 1, abstentions: 0 },
      ],
      actionUrl: "https://app.plex.tv/desktop/#!/server/demo/details",
      actionLabel: "Open in Plex",
      tasteSnapshot: { dominantGenres: ["Science Fiction", "Drama"], closestMatchup: { winnerTitle: "Crimson Relay", loserTitle: "Aurora Drift", margin: 1 }, surpriseWildcard: "Crimson Relay", consensusPercent: 75 },
    };
  return {
    type: "LOBBY",
    roomName: "Friday Movie Night",
    roomCode: "7K9MQR",
    joinUrl: "https://vote.famflix.live/join/7K9MQR",
    locked: false,
    participants: [
      { nickname: "Haden", role: "HOST", connected: true },
      { nickname: "Maya", role: "PARTICIPANT", connected: true },
      { nickname: "Alex", role: "PARTICIPANT", connected: true },
    ],
  };
}
export default function TestMode() {
  const [preset, setPreset] = useState<"720p" | "1080p">("1080p");
  const [mode, setMode] = useState(process.env.NEXT_PUBLIC_PRESENTATION_SCENE ?? "lobby");
  const [reduced, setReduced] = useState(false);
  const [state, setState] = useState<"connected" | "reconnecting">("connected");
  const [demo, setDemo] = useState(process.env.NEXT_PUBLIC_PRESENTATION_DEMO === "1");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requested = query.get("scene");
    if (["lobby", "nominations", "intro", "voting", "result", "winner", "bracket", "objection", "objection-result"].includes(requested ?? "")) setMode(requested!);
    setDemo(query.get("demo") === "1");
  }, []);
  const width = preset === "720p" ? 1280 : 1920;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ENABLE_PRESENTATION_TEST_MODE !== "true"
  )
    return (
      <main className="shell">
        <BrandLogo label="Presentation test mode" />
        <h1>Presentation Test Mode is disabled.</h1>
      </main>
    );
  return (
    <main
      style={{
        background: "#030305",
        minHeight: "100vh",
        padding: demo ? 0 : 16,
        color: "white",
        fontFamily: "system-ui",
      }}
    >
      {!demo && <aside className="card actions" style={{ marginBottom: 16 }}>
        <label>
          Viewport
          <select
            value={preset}
            onChange={(event) => setPreset(event.target.value as typeof preset)}
          >
            <option>720p</option>
            <option>1080p</option>
          </select>
        </label>
        <label>
          Scene
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            {[
              "lobby",
              "nominations",
              "intro",
              "voting",
              "result",
              "winner",
              "bracket",
              "objection",
              "objection-result",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={reduced}
            onChange={(event) => setReduced(event.target.checked)}
          />{" "}
          Reduced motion
        </label>
        <button
          className="secondary"
          onClick={() =>
            setState(state === "connected" ? "reconnecting" : "connected")
          }
        >
          {state}
        </button>
      </aside>}
      <div
        style={{
          width: "100%",
          maxWidth: width,
          margin: "auto",
          overflow: "hidden",
        }}
        data-reduced-motion={reduced}
      >
        <RoomDisplay connection={state} scene={fixture(mode)} lowPower={reduced} />
      </div>
    </main>
  );
}
