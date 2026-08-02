"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";
import {
  DisplayEnvelopeSchema,
  type DisplayScene,
} from "@watch-bracket/display-protocol";
import { RoomDisplay } from "@watch-bracket/display-ui";
import {
  RoomSnapshotSchema,
  ServerEnvelopeSchema,
} from "@watch-bracket/realtime-protocol";
import { api } from "../../../lib/api";
import { BrandLogo } from "../../../components/brand-logo";

function sceneFromSnapshot(value: unknown): DisplayScene {
  const snapshot = RoomSnapshotSchema.parse(value);
  if (snapshot.state === "LOBBY" || snapshot.state === "EXPIRED")
    return {
      type: "LOBBY",
      roomName: snapshot.name,
      roomCode: snapshot.code,
      joinUrl: `${window.location.origin}/join/${snapshot.code}`,
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
  if (!tournament) throw new Error("Tournament unavailable");
  const matchup = tournament.activeMatchup;
  const candidate = (item: NonNullable<typeof matchup>["candidateA"]) => ({
    id: item.id,
    title: item.title,
    mediaType: item.mediaType,
    releaseYear: item.releaseYear,
    runtimeMinutes: item.runtimeMinutes,
    contentRating: item.contentRating,
    genres: item.genres,
    ...(item.posterUrl !== undefined ? { posterUrl: item.posterUrl } : {}),
    ...(item.availability ? { availability: item.availability } : {}),
    ...(item.localAvailability ? { localAvailability: item.localAvailability } : {}),
    ...(item.requestAvailability ? { requestAvailability: item.requestAvailability } : {}),
    seed: item.seed,
    strikes: item.strikes,
    redemption: item.redemption,
  });
  if (snapshot.state === "WINNER" && tournament.champion)
    return {
      type: "WINNER",
      roomName: snapshot.name,
      winner: candidate(tournament.champion),
      path: tournament.bracket
        .filter((result) => result.winnerId === tournament.champion!.id)
        .map((result) => ({
          stage: result.stage,
          opponentTitle: result.loserTitle,
        })),
      actionUrl: tournament.champion.localAvailability?.plexUrl ?? tournament.champion.availability?.link ?? `https://www.themoviedb.org/${tournament.champion.mediaType === "MOVIE" ? "movie" : "tv"}/${tournament.champion.catalogKey.split(":").at(-1)}`,
      actionLabel: tournament.champion.localAvailability?.plexUrl ? "Open in Plex" : tournament.champion.availability?.link ? "View streaming options" : "View title details",
      tasteSnapshot: tournament.tasteSnapshot,
    };
  if (!matchup) throw new Error("Matchup unavailable");
  const base = {
    roomName: snapshot.name,
    stage: matchup.stage,
    matchupNumber: matchup.sequence,
    totalMatchups: tournament.totalMatchups,
    candidateA: candidate(matchup.candidateA),
    candidateB: candidate(matchup.candidateB),
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
  const result = matchup.resolution!;
  const winner =
    result.winnerId === matchup.candidateA.id
      ? matchup.candidateA
      : matchup.candidateB;
  const loser =
    result.loserId === matchup.candidateA.id
      ? matchup.candidateA
      : matchup.candidateB;
  const winnerIsA = winner.id === matchup.candidateA.id;
  return {
    type: "MATCHUP_RESULT",
    roomName: snapshot.name,
    stage: matchup.stage,
    matchupNumber: matchup.sequence,
    totalMatchups: tournament.totalMatchups,
    winner: candidate(winner),
    loser: candidate(loser),
    votesWinner: winnerIsA ? result.votesA : result.votesB,
    votesLoser: winnerIsA ? result.votesB : result.votesA,
    abstentions: result.abstentions,
    tieBreak: result.tieBreak,
    deadline: matchup.deadline,
  };
}
export default function ActiveDisplay() {
  const { displaySessionId } = useParams<{ displaySessionId: string }>();
  const [scene, setScene] = useState<DisplayScene>();
  const [state, setState] = useState<"connected" | "reconnecting" | "revoked">(
    "reconnecting",
  );
  const [online, setOnline] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const roomId = useRef("");
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const snapshot = RoomSnapshotSchema.parse(
      await api<unknown>(`/api/rooms/${roomId.current}/snapshot`),
    );
    sequence.current = snapshot.sequence;
    setScene(sceneFromSnapshot(snapshot));
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      try { lock = await navigator.wakeLock?.request("screen"); setWakeLockActive(Boolean(lock)); lock?.addEventListener("release",()=>setWakeLockActive(false)); }
      catch { setWakeLockActive(false); }
    };
    const visible = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire(); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); document.removeEventListener("visibilitychange", visible); void lock?.release(); };
  }, []);
  useEffect(() => {
    if (!scene) return;
    const urls = "winner" in scene ? [scene.winner.posterUrl] : "candidateA" in scene ? [scene.candidateA.posterUrl, scene.candidateB.posterUrl] : [];
    for (const url of urls) if (url) { const image = new Image(); image.src = url; }
  }, [scene]);
  useEffect(() => {
    let socket: ReturnType<typeof io> | undefined;
    let disposed = false;
    void api<unknown>(`/api/displays/${displaySessionId}/snapshot`)
      .then((value) => {
        const snapshot = RoomSnapshotSchema.parse(value);
        if (disposed) return;
        roomId.current = snapshot.roomId;
        sequence.current = snapshot.sequence;
        setScene(sceneFromSnapshot(snapshot));
        socket = io({ path: "/socket.io", withCredentials: true });
        socket.on("connect", () => {
          setState("connected");
          socket!.emit("display:subscribe", {
            roomId: snapshot.roomId,
            displaySessionId,
          });
        });
        socket.on("display:snapshot", (input: unknown) => {
          const outer = ServerEnvelopeSchema.safeParse(input);
          if (!outer.success) return;
          const next = RoomSnapshotSchema.safeParse(outer.data.payload);
          if (!next.success) return;
          sequence.current = next.data.sequence;
          setScene(sceneFromSnapshot(next.data));
        });
        socket.on("display:scene", (input: unknown) => {
          const parsed = DisplayEnvelopeSchema.safeParse(input);
          if (!parsed.success) return;
          if (sequence.current && parsed.data.sequence > sequence.current + 1) {
            void load();
            return;
          }
          if (parsed.data.sequence >= sequence.current) {
            sequence.current = parsed.data.sequence;
            setScene(parsed.data.scene);
          }
        });
        socket.on("display:revoked", () => {
          setState("revoked");
          socket?.disconnect();
        });
        socket.on("disconnect", (reason) => {
          if (reason !== "io client disconnect") setState("reconnecting");
        });
      })
      .catch(() => setState("revoked"));
    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [displaySessionId, load]);
  useEffect(() => {
    if (scene) { setLoadingSlow(false); return; }
    const timer = window.setTimeout(() => setLoadingSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [scene]);
  if (state === "revoked")
    return (
      <RoomDisplay
        connection="revoked"
        scene={
          scene ?? {
            type: "LOBBY",
            roomName: "Display revoked",
            roomCode: "—",
            joinUrl: "https://bracket.famflix.live",
            locked: true,
            participants: [],
          }
        }
      />
    );
  if (!scene)
    return (
      <main className="display-connecting">
        <div>
          <BrandLogo label="Shared display" />
          <h1>Connecting to the room…</h1>
          <p>{loadingSlow ? "The room is taking longer than expected. Check the network, then pair this display again if it does not recover." : "Preloading tonight's presentation…"}</p>
        </div>
      </main>
    );
  return <>
    <RoomDisplay scene={scene} connection={online ? state : "reconnecting"} />
    <div className="display-tools" aria-live="polite">
      <span>{online ? (wakeLockActive ? "Screen awake" : "Wake lock unavailable") : "Offline · reconnecting"}</span>
      <button className="secondary" onClick={()=>void document.documentElement.requestFullscreen?.()}>Fullscreen</button>
    </div>
  </>;
}
