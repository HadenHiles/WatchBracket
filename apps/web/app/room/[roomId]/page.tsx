"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { io, type Socket } from "socket.io-client";
import {
  controllerEvents,
  RoomSnapshotSchema,
  ServerEnvelopeSchema,
  type CatalogItem,
  type HouseRules,
  type RoomSnapshot,
} from "@watch-bracket/realtime-protocol";
import { api } from "../../../lib/api";
import { useCast } from "../../../lib/use-cast";
import { isMobileBrowser, plexAppDeepLink } from "../../../lib/plex-link";
import { BrandLogo } from "../../../components/brand-logo";
import { EliminationBracket } from "@watch-bracket/display-ui";

const presets: Record<HouseRules["preset"], HouseRules> = {
  QUICK_PICK: {
    preset: "QUICK_PICK",
    nominationDurationSeconds: 60,
    nominationSlots: 2,
    revealMode: "AFTER_DEADLINE",
  },
  MOVIE_NIGHT: {
    preset: "MOVIE_NIGHT",
    nominationDurationSeconds: 120,
    nominationSlots: 2,
    revealMode: "AFTER_DEADLINE",
  },
  DEEP_DIVE: {
    preset: "DEEP_DIVE",
    nominationDurationSeconds: 180,
    nominationSlots: 2,
    revealMode: "AFTER_DEADLINE",
  },
};

const presetLabels: Record<HouseRules["preset"], { name: string; detail: string }> = {
  QUICK_PICK: { name: "Quick", detail: "1 minute" },
  MOVIE_NIGHT: { name: "Classic", detail: "2 minutes" },
  DEEP_DIVE: { name: "Relaxed", detail: "3 minutes" },
};

function useCountdown(deadline: string | null | undefined) {
  const calculate = useCallback(
    () =>
      deadline
        ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000))
        : 0,
    [deadline],
  );
  const [seconds, setSeconds] = useState(calculate);
  useEffect(() => {
    setSeconds(calculate());
    const timer = setInterval(() => setSeconds(calculate()), 1000);
    return () => clearInterval(timer);
  }, [calculate]);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function CastGlyph() {
  return (
    <svg className="cast-glyph" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="4" width="26" height="19" rx="2" />
      <path d="M4 25a3 3 0 0 1 3 3H4z" />
      <path d="M4 20a8 8 0 0 1 8 8" />
      <path d="M4 15a13 13 0 0 1 13 13" />
    </svg>
  );
}

function WinnerViewGlyph({ view }: { view: "PODIUM" | "BRACKET" }) {
  return view === "BRACKET" ? (
    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 5h8v6H5zM5 21h8v6H5zM19 13h8v6h-8zM13 8h3v16h-3M16 16h3" /></svg>
  ) : (
    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 20h7v8H4zM13 12h7v16h-7zM22 17h7v11h-7zM16.5 3l1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1L12 6.3l3.1-.5z" /></svg>
  );
}

function tasteQuip(taste: NonNullable<NonNullable<RoomSnapshot["tournament"]>["tasteSnapshot"]>) {
  if (taste.consensusPercent !== null && taste.consensusPercent >= 75)
    return "The group chat actually agreed. Historic.";
  if (taste.closestMatchup?.margin === 1)
    return "A one-vote nail-biter. The drama started before the movie.";
  if (taste.surpriseWildcard)
    return `Plot twist: ${taste.surpriseWildcard} crashed the party.`;
  return "The couch understood the assignment.";
}

function playRoomCue(state: RoomSnapshot["state"]) {
  const AudioContextClass = window.AudioContext;
  const audio = new AudioContextClass();
  const notes =
    state === "MATCHUP_INTRO"
      ? [147, 220]
      : state === "VOTING"
        ? [330, 494]
        : state === "MATCHUP_RESULT"
          ? [220, 440]
          : state === "WINNER"
            ? [392, 523, 659, 784]
            : [];
  notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const startsAt = audio.currentTime + index * 0.11;
    oscillator.type = state === "MATCHUP_INTRO" ? "sawtooth" : "square";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(0.035, startsAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.16);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + 0.17);
  });
  window.setTimeout(() => void audio.close(), 900);
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<RoomSnapshot>();
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting"
  >("connecting");
  const [error, setError] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem>();
  const [catalogSource, setCatalogSource] = useState<"TMDB" | "MOCK">();
  const [catalogWarning, setCatalogWarning] = useState("");
  const [plexConnected, setPlexConnected] = useState(false);
  const [plexAccountLabel, setPlexAccountLabel] = useState<string>();
  const [plexWatchlist, setPlexWatchlist] = useState<CatalogItem[]>([]);
  const [plexRecommendations, setPlexRecommendations] = useState<CatalogItem[]>([]);
  const [plexStatusLoaded, setPlexStatusLoaded] = useState(false);
  const [plexPending, setPlexPending] = useState(false);
  const [plexMessage, setPlexMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [rules, setRules] = useState<HouseRules>(presets.MOVIE_NIGHT);
  const [format, setFormat] = useState<8 | 12 | 16>(8);
  const [voteDuration, setVoteDuration] = useState(30);
  const [selectedVoteId, setSelectedVoteId] = useState<string>();
  const [winnerActionMessage, setWinnerActionMessage] = useState("");
  const [tvSeasonPolicy, setTvSeasonPolicy] = useState<"FIRST" | "LATEST" | "ALL">("FIRST");
  const [winnerActionPending, setWinnerActionPending] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const [displayWinnerView, setDisplayWinnerView] = useState<"AUTO" | "PODIUM" | "BRACKET">("AUTO");
  const [objectionGoldId, setObjectionGoldId] = useState<string>();
  const [objectionSilverId, setObjectionSilverId] = useState<string>();
  const [objectionRank, setObjectionRank] = useState<"GOLD" | "SILVER">("GOLD");
  const [objectionPending, setObjectionPending] = useState(false);
  const previousState = useRef<RoomSnapshot["state"] | undefined>(undefined);
  const searchRequest = useRef(0);
  const plexPollTimer = useRef<number | undefined>(undefined);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    try {
      const parsed = RoomSnapshotSchema.parse(
        await api<unknown>(`/api/rooms/${roomId}/snapshot`),
      );
      sequence.current = parsed.sequence;
      setSnapshot(parsed);
      setRules(parsed.rules);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load room",
      );
    }
  }, [roomId]);
  const castDisplay = snapshot?.displays.find(
    (display) => display.kind === "CAST",
  );
  const cast = useCast({
    enabled: snapshot?.viewer === "HOST",
    roomId,
    activeDisplay: castDisplay,
  });
  useEffect(() => {
    void load();
    const socket: Socket = io({ path: "/socket.io", withCredentials: true });
    socket.on("connect", () => {
      setConnection("connected");
      socket.emit("room:subscribe", { roomId, lastSequence: sequence.current });
    });
    socket.on("disconnect", () => setConnection("reconnecting"));
    socket.on("connect_error", () => setConnection("reconnecting"));
    const receive = (input: unknown) => {
      const outer = ServerEnvelopeSchema.safeParse(input);
      if (!outer.success) return;
      const next = RoomSnapshotSchema.safeParse(outer.data.payload);
      if (!next.success) return;
      if (sequence.current && outer.data.sequence > sequence.current + 1) {
        void load();
        return;
      }
      if (outer.data.sequence >= sequence.current) {
        sequence.current = outer.data.sequence;
        setSnapshot(next.data);
      }
    };
    for (const event of controllerEvents) socket.on(event, receive);
    return () => {
      socket.disconnect();
    };
  }, [roomId, load]);
  useEffect(() => { setEffectsEnabled(window.localStorage.getItem("watch-bracket-effects") === "on"); }, []);
  useEffect(() => {
    if (!snapshot) return;
    const changed = previousState.current && previousState.current !== snapshot.state;
    previousState.current = snapshot.state;
    const posters = snapshot.tournament ? [snapshot.tournament.champion?.posterUrl, snapshot.tournament.activeMatchup?.candidateA.posterUrl, snapshot.tournament.activeMatchup?.candidateB.posterUrl] : [];
    for (const url of posters) if (url) { const image = new window.Image(); image.src = url; }
    if (!changed || !effectsEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (snapshot.state === "VOTING") navigator.vibrate?.(25);
    if (snapshot.state === "MATCHUP_RESULT") navigator.vibrate?.([35, 45, 35]);
    if (snapshot.state === "WINNER") navigator.vibrate?.([60, 50, 90]);
    if (["MATCHUP_INTRO", "VOTING", "MATCHUP_RESULT", "WINNER"].includes(snapshot.state))
      try { playRoomCue(snapshot.state); } catch { /* optional feedback */ }
  }, [snapshot, effectsEnabled]);
  useEffect(() => () => {
    if (plexPollTimer.current) window.clearInterval(plexPollTimer.current);
  }, []);
  useEffect(() => {
    const participantId = snapshot?.viewerParticipantId;
    if (!participantId) return;
    const key = `watch-bracket:plex:${participantId}`;
    const cached = window.sessionStorage.getItem(key);
    if (cached) {
      setPlexConnected(true);
      setPlexStatusLoaded(true);
      setPlexAccountLabel(cached);
    }
    void checkPlexStatus(["LOBBY", "NOMINATING"].includes(snapshot.state)).catch(() => {
      setPlexStatusLoaded(true);
      setPlexMessage("Plex quick suggestions are optional.");
    });
  }, [snapshot?.viewerParticipantId, snapshot?.state]);
  const joinUrl = useMemo(
    () => (snapshot ? `${window.location.origin}/join/${snapshot.code}` : ""),
    [snapshot],
  );
  const countdown = useCountdown(snapshot?.nominationDeadline);
  const autoStartCountdown = useCountdown(snapshot?.nominationAutoStartAt);
  const voteCountdown = useCountdown(
    snapshot?.tournament?.activeMatchup?.deadline,
  );
  const activeMatchup = snapshot?.tournament?.activeMatchup;
  const selectedVoteTitle = activeMatchup
    ? [activeMatchup.candidateA, activeMatchup.candidateB].find((candidate) => candidate.id === selectedVoteId)?.title
    : undefined;
  useEffect(() => {
    setSelectedVoteId(activeMatchup?.ownVote?.candidateId ?? undefined);
  }, [activeMatchup?.id, activeMatchup?.ownVote?.candidateId]);
  const host = snapshot?.viewer === "HOST";
  useEffect(() => {
    if (snapshot?.state !== "WINNER") {
      setDisplayWinnerView("AUTO");
      return;
    }
    setDisplayWinnerView("AUTO");
    const timer = window.setTimeout(() => setDisplayWinnerView("BRACKET"), 10_000);
    return () => window.clearTimeout(timer);
  }, [snapshot?.state, snapshot?.tournament?.champion?.id]);
  useEffect(() => {
    const objection = snapshot?.tournament?.objection;
    if (!objection) {
      setObjectionGoldId(undefined);
      setObjectionSilverId(undefined);
      setObjectionRank("GOLD");
      return;
    }
    if (objection.ownBallot) {
      setObjectionGoldId(objection.ownBallot.goldCandidateId);
      setObjectionSilverId(objection.ownBallot.silverCandidateId);
      return;
    }
    setObjectionGoldId((current) => objection.candidates.some((candidate) => candidate.id === current) ? current : undefined);
    setObjectionSilverId((current) => objection.candidates.some((candidate) => candidate.id === current) ? current : undefined);
  }, [snapshot?.tournament?.objection?.status, snapshot?.tournament?.objection?.ownBallot?.goldCandidateId, snapshot?.tournament?.objection?.ownBallot?.silverCandidateId]);
  useEffect(() => {
    if (snapshot?.state !== "NOMINATING") return;
    const term = query.trim();
    if (term.length < 2) {
      searchRequest.current += 1;
      setResults([]);
      setCatalogSource(undefined);
      setCatalogWarning("");
      setSearching(false);
      return;
    }
    const requestId = ++searchRequest.current;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void api<{
        items: CatalogItem[];
        source: "TMDB" | "MOCK";
        warning?: string;
      }>(`/api/catalog/search?q=${encodeURIComponent(term)}&autocomplete=true`)
        .then((response) => {
          if (requestId !== searchRequest.current) return;
          setResults(response.items);
          setCatalogSource(response.source);
          setCatalogWarning(response.warning ?? "");
        })
        .catch((reason: unknown) => {
          if (requestId !== searchRequest.current) return;
          setCatalogWarning(
            reason instanceof Error
              ? reason.message
              : "Search suggestions are temporarily unavailable.",
          );
        })
        .finally(() => {
          if (requestId === searchRequest.current) setSearching(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, snapshot?.state]);
  async function mutate(path: string, method = "POST", body?: unknown) {
    setError("");
    try {
      const init: RequestInit =
        body === undefined
          ? { method }
          : { method, body: JSON.stringify(body) };
      await api(path, init);
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
      return false;
    }
  }
  async function toggleWinnerDisplay() {
    const previous = displayWinnerView;
    const next = previous === "BRACKET" ? "PODIUM" : "BRACKET";
    setDisplayWinnerView(next);
    const changed = await mutate(
      `/api/rooms/${roomId}/winner/display-mode`,
      "POST",
      { mode: next },
    );
    if (!changed) setDisplayWinnerView(previous);
  }
  async function raiseObjection() {
    if (!window.confirm("Demand one final Gold + Silver vote from everyone? Each room gets one objection.")) return;
    setObjectionPending(true);
    try {
      await mutate(`/api/rooms/${roomId}/winner/objection`, "POST", {});
    } finally {
      setObjectionPending(false);
    }
  }
  function chooseObjectionCandidate(candidateId: string) {
    if (candidateId === objectionGoldId) {
      setObjectionGoldId(undefined);
      setObjectionRank("GOLD");
      return;
    }
    if (candidateId === objectionSilverId) {
      setObjectionSilverId(undefined);
      setObjectionRank("SILVER");
      return;
    }
    if (objectionRank === "GOLD") {
      setObjectionGoldId(candidateId);
      setObjectionRank("SILVER");
    } else {
      setObjectionSilverId(candidateId);
    }
  }
  async function lockObjectionBallot() {
    if (!objectionGoldId || !objectionSilverId) return;
    setObjectionPending(true);
    try {
      await mutate(`/api/rooms/${roomId}/winner/objection/ballot`, "PUT", {
        goldCandidateId: objectionGoldId,
        silverCandidateId: objectionSilverId,
      });
    } finally {
      setObjectionPending(false);
    }
  }
  async function pairing() {
    try {
      const result = await api<{ pairingCode: string }>(
        `/api/rooms/${roomId}/display-pairing-codes`,
        { method: "POST", body: "{}" },
      );
      setPairingCode(result.pairingCode);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create pairing code",
      );
    }
  }
  async function requestWinner() {
    if (!window.confirm("Send this winning title to Seerr now?")) return;
    setWinnerActionPending(true); setWinnerActionMessage("");
    try {
      const champion = snapshot?.tournament?.champion;
      const result = await api<{ requested: boolean; status: string }>(`/api/rooms/${roomId}/winner/request`, {
        method: "POST",
        body: JSON.stringify({ confirm: true, ...(champion?.mediaType === "TV" ? { tvSeasonPolicy } : {}) }),
      });
      setWinnerActionMessage(result.requested ? `Request verified · ${result.status.toLowerCase()}` : "Request was not accepted.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not request winner"); }
    finally { setWinnerActionPending(false); }
  }
  async function replay() {
    setWinnerActionPending(true);
    try {
      const result = await api<{ roomId: string }>(`/api/rooms/${roomId}/run-it-back`, { method: "POST", body: "{}" });
      router.replace(`/room/${result.roomId}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create replay room"); setWinnerActionPending(false); }
  }
  async function assignPick(rank: 1 | 2, catalogKey: string) {
    if (snapshot?.viewerReady) {
      setError("Tap Edit picks before replacing a locked choice.");
      return;
    }
    if (
      await mutate(`/api/rooms/${roomId}/submissions/${rank}`, "PUT", {
        catalogKey,
      })
    )
      setSelectedItem((current) =>
        current?.catalogKey === catalogKey ? undefined : current,
      );
  }
  function chooseCandidate(item: CatalogItem) {
    if (snapshot?.viewerReady) return;
    const missingRank = ([1, 2] as const).find(
      (rank) => !snapshot?.ownSubmissions.some((pick) => pick.rank === rank),
    );
    if (missingRank) {
      void assignPick(missingRank, item.catalogKey);
      return;
    }
    setSelectedItem(item);
  }
  async function loadPlexWatchlist() {
    const response = await api<{ watchlist: CatalogItem[]; recommended: CatalogItem[]; tasteSource: "PLEX" | "PLEX_AND_TAUTULLI" }>(
      "/api/catalog/plex-suggestions",
    );
    setPlexWatchlist(response.watchlist);
    setPlexRecommendations(response.recommended);
    setPlexMessage(
      response.watchlist.length || response.recommended.length
        ? `${response.watchlist.length + response.recommended.length} personal suggestions ready${response.tasteSource === "PLEX_AND_TAUTULLI" ? " from Plex + Tautulli" : ""}`
        : "No eligible Plex suggestions match these house rules yet.",
    );
  }
  async function checkPlexStatus(loadSuggestions = true) {
    const status = await api<{ connected: boolean; accountLabel: string | null }>(
      "/api/plex/status",
    );
    setPlexConnected(status.connected);
    setPlexStatusLoaded(true);
    setPlexAccountLabel(status.accountLabel ?? undefined);
    const participantId = snapshot?.viewerParticipantId;
    if (participantId) {
      const key = `watch-bracket:plex:${participantId}`;
      if (status.connected) {
        const label = status.accountLabel ?? "Plex connected";
        window.sessionStorage.setItem(key, label);
        window.sessionStorage.setItem("watch-bracket:plex:session", label);
      } else {
        window.sessionStorage.removeItem(key);
        window.sessionStorage.removeItem("watch-bracket:plex:session");
      }
    }
    if (status.connected && loadSuggestions) await loadPlexWatchlist();
    return status.connected;
  }
  async function connectPlex() {
    setPlexPending(true);
    setPlexMessage("Opening Plex sign-in…");
    const popup = window.open("about:blank", "watch-bracket-plex", "popup,width=520,height=720");
    try {
      const auth = await api<{ authUrl: string; expiresAt: string }>(
        "/api/plex/auth/start",
        { method: "POST", body: "{}" },
      );
      if (popup) popup.location.href = auth.authUrl;
      else window.location.href = auth.authUrl;
      setPlexMessage("Finish signing in with Plex; this page will update automatically.");
      if (plexPollTimer.current) window.clearInterval(plexPollTimer.current);
      plexPollTimer.current = window.setInterval(() => {
        void checkPlexStatus().then((connected) => {
          if (!connected) return;
          if (plexPollTimer.current) window.clearInterval(plexPollTimer.current);
          plexPollTimer.current = undefined;
          setPlexPending(false);
          setPlexMessage("Plex watchlist connected.");
          popup?.close();
        }).catch(() => undefined);
      }, 1500);
    } catch (reason) {
      popup?.close();
      setPlexPending(false);
      setPlexMessage(reason instanceof Error ? reason.message : "Could not connect Plex.");
    }
  }
  async function disconnectPlex() {
    try {
      await api("/api/plex/auth", { method: "DELETE" });
      setPlexConnected(false);
      setPlexAccountLabel(undefined);
      setPlexWatchlist([]);
      setPlexRecommendations([]);
      setPlexMessage("Plex disconnected from this room profile.");
      if (snapshot?.viewerParticipantId) window.sessionStorage.removeItem(`watch-bracket:plex:${snapshot.viewerParticipantId}`);
      window.sessionStorage.removeItem("watch-bracket:plex:session");
    } catch (reason) {
      setPlexMessage(reason instanceof Error ? reason.message : "Could not disconnect Plex.");
    }
  }
  if (!snapshot)
    return (
      <main className="shell">
        <BrandLogo label="Movie night" />
        <div className="card">
          <h1>Loading room…</h1>
          {error && <p className="error">{error}</p>}
        </div>
      </main>
    );
  const nominating = snapshot.state === "NOMINATING";
  const autoStarting = nominating && snapshot.nominationAutoStartAt !== null;
  const revealed = snapshot.state === "NOMINATIONS_LOCKED";
  const champion = snapshot.tournament?.champion;
  const winnerActionUrl = champion?.localAvailability?.plexUrl ?? champion?.requestAvailability?.requestUrl ?? champion?.availability?.link ?? window.location.href;
  function openPlexApp(event: ReactMouseEvent<HTMLAnchorElement>) {
    const webUrl = champion?.localAvailability?.plexUrl;
    const appUrl = plexAppDeepLink(webUrl, champion?.mediaType ?? "MOVIE");
    if (!webUrl || !appUrl || !isMobileBrowser(window.navigator.userAgent)) return;
    event.preventDefault();
    const fallback = window.setTimeout(() => {
      if (document.visibilityState === "visible") window.location.assign(webUrl);
    }, 1400);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") window.clearTimeout(fallback);
    }, { once: true });
    window.location.assign(appUrl);
  }
  const canStartCast = cast.state === "ready";
  const castButtonLabel =
    cast.state === "loading"
      ? "Finding TVs…"
      : cast.state === "unavailable"
        ? "No TVs found"
      : cast.state === "connecting"
        ? "Connecting…"
        : cast.state === "connected"
          ? `Casting to ${cast.deviceName}`
          : cast.state === "error"
            ? "Cast unavailable"
          : "Cast to TV";
  return (
    <main className="shell stack">
      <BrandLogo label="Movie night" />
      <button className="effects-toggle secondary" aria-pressed={effectsEnabled} onClick={()=>{const next=!effectsEnabled;setEffectsEnabled(next);window.localStorage.setItem("watch-bracket-effects",next?"on":"off");}}>{effectsEnabled ? "Sound + haptics on" : "Sound + haptics off"}</button>
      {host && castDisplay && (
        <div className="tv-strip">
          <span>
            <strong>
              {cast.deviceName}{" "}
              {castDisplay.connected ? "connected" : "ready to resume"}
            </strong>
            <br />
            <small className="muted">Shared display · {cast.state}</small>
          </span>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => void cast.requestSession()}
            >
              Resume on TV
            </button>
            <button className="danger" onClick={() => void cast.disconnect()}>
              Disconnect
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <section className="card">
        <div className="status" role="status" aria-live="polite">
          <span className={`dot ${connection === "connected" ? "" : "off"}`} />
          {connection}
        </div>
        <h1>{snapshot.name}</h1>
        <p className="muted">Room code</p>
        <div className="room-code">{snapshot.code}</div>
        <div className="actions">
          <button
            className="secondary"
            onClick={() => void navigator.clipboard.writeText(joinUrl)}
          >
            Copy join link
          </button>
          <span>
            {snapshot.state === "LOBBY"
              ? snapshot.locked ? "🔒 Joining paused" : "● Open to join"
              : ["MATCHUP_INTRO", "VOTING", "MATCHUP_RESULT"].includes(snapshot.state)
                ? "● Open to late voters"
                : "Picks in progress"}
          </span>
        </div>
      </section>
      {snapshot.state === "LOBBY" && plexStatusLoaded && !plexConnected && (
        <section className="card plex-welcome">
          <Image src="/brand/plex-logo.svg" alt="Plex" width={118} height={36} />
          <div>
            <h2>Make this bracket feel like you</h2>
            <p className="muted">Add your watchlist and personalized picks. Every player can connect their own account.</p>
          </div>
          <button className="plex-button" disabled={plexPending} onClick={() => void connectPlex()}>
            {plexPending ? "Waiting for Plex…" : "Sign in with Plex"}
          </button>
        </section>
      )}
      {snapshot.state === "LOBBY" && plexConnected && (
        <div className="plex-connected" role="status">
          <Image src="/brand/plex-logo.svg" alt="Plex" width={72} height={22} />
          <span>{plexAccountLabel ?? "Account connected"} · personalized picks ready</span>
        </div>
      )}
      {host && !castDisplay && (
        <section className="card cast-callout" aria-labelledby="cast-heading">
          <div className="cast-callout-copy">
            <p className="kicker">Big screen</p>
            <h2 id="cast-heading">Play on the TV</h2>
            <p className="muted">Choose a nearby TV.</p>
          </div>
          <button
            className="cast-primary"
            onClick={() => void cast.requestSession()}
            disabled={!canStartCast}
          >
            <CastGlyph />
            <span>
              <strong>{castButtonLabel}</strong>
              <small>
                {canStartCast
                  ? "Choose a screen nearby"
                  : cast.state === "loading"
                    ? "Checking for Cast devices"
                    : "Google Cast"}
              </small>
            </span>
          </button>
          {cast.state === "connected" && (
            <button className="secondary" onClick={() => void cast.disconnect()}>
              Stop casting
            </button>
          )}
          {cast.message && <p className="cast-help muted">{cast.message}</p>}
        </section>
      )}
      {snapshot.state === "LOBBY" && (
        <>
          <div className="two-col lobby-grid">
            <section className="card">
              <h2>Tonight&apos;s crew</h2>
              <ul className="people">
                {snapshot.participants.map((person, index) => (
                  <li
                    className="person"
                    key={person.id ?? `${person.nickname}-${index}`}
                  >
                    <span>
                      {person.connected ? "●" : "○"} {person.nickname}
                    </span>
                    <span>{person.role === "HOST" ? "Host" : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card stack invite-card">
              <h2>Scan to join</h2>
              <div className="qr-frame">
                <QRCodeSVG
                  value={joinUrl}
                  size={156}
                  fgColor="#06194d"
                  bgColor="#fffdf0"
                />
              </div>
              <small className="muted">Point your phone camera here</small>
            </section>
          </div>
          {host && (
            <section className="card stack">
              <h2>Ready to pick?</h2>
              <p className="muted">
                Each player chooses their top two. Picks stay secret until the bracket begins.
              </p>
              <div className="preset-grid">
                {Object.values(presets).map((preset) => (
                  <button
                    className={
                      rules.preset === preset.preset
                        ? "preset selected"
                        : "preset secondary"
                    }
                    key={preset.preset}
                    onClick={() =>
                      setRules({
                        ...preset,
                        mediaTypes: rules.mediaTypes,
                        maxRuntimeMinutes: rules.maxRuntimeMinutes,
                        availabilityMode: rules.availabilityMode,
                      })
                    }
                  >
                    <span>
                      <strong>{presetLabels[preset.preset].name}</strong>
                      <br />
                      <small>{presetLabels[preset.preset].detail}</small>
                    </span>
                  </button>
                ))}
              </div>
              <details className="room-options">
                <summary>Change movie-night options</summary>
                <div className="two-col">
                  <label>
                    Titles
                    <select
                      value={(rules.mediaTypes ?? ["MOVIE", "TV"]).join(",")}
                      onChange={(event) =>
                        setRules({
                          ...rules,
                          mediaTypes: event.target.value.split(",") as ("MOVIE" | "TV")[],
                        })
                      }
                    >
                      <option value="MOVIE,TV">Movies &amp; TV</option>
                      <option value="MOVIE">Movies only</option>
                      <option value="TV">TV only</option>
                    </select>
                  </label>
                  <label>
                    Longest runtime
                    <select
                      value={rules.maxRuntimeMinutes ?? ""}
                      onChange={(event) =>
                        setRules({
                          ...rules,
                          maxRuntimeMinutes: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    >
                      <option value="">No limit</option>
                      <option value="90">90 minutes</option>
                      <option value="120">120 minutes</option>
                      <option value="150">150 minutes</option>
                      <option value="180">180 minutes</option>
                    </select>
                  </label>
                  <label>
                    Where to watch
                    <select
                      value={rules.availabilityMode ?? "ANY"}
                      onChange={(event) =>
                        setRules({
                          ...rules,
                          availabilityMode: event.target.value as "ANY" | "WATCH_NOW" | "HYBRID",
                        })
                      }
                    >
                      <option value="ANY">Any title</option>
                      <option value="WATCH_NOW">Already available</option>
                      <option value="HYBRID">Available or requestable</option>
                    </select>
                  </label>
                </div>
              </details>
              <button
                onClick={() =>
                  void mutate(
                    `/api/rooms/${roomId}/nominations/start`,
                    "POST",
                    { rules },
                  )
                }
              >
                Start picking
              </button>
            </section>
          )}
        </>
      )}
      {nominating && (
        <>
          <section className="card nomination-header">
            <div>
              <p className="brand">Private nominations</p>
              <h2>
                {snapshot.nominationProgress.submittedParticipants} of{" "}
                {snapshot.nominationProgress.totalParticipants} have picked
              </h2>
              <p className="muted">
                {autoStarting
                  ? "Everyone locked in · starting automatically"
                  : `${snapshot.nominationProgress.lockedParticipants} locked in`}
              </p>
            </div>
            <div className="timer" aria-label={`${autoStarting ? autoStartCountdown : countdown} remaining`}>
              {autoStarting ? autoStartCountdown : countdown}
            </div>
          </section>
          <section className="card nomination-dock" aria-label="Your pinned picks">
            <div className="nomination-dock-heading">
              <div>
                <p className="kicker">Pinned picks</p>
                <h2>Your double feature</h2>
              </div>
              <div className="dock-timer" aria-label={`${countdown} remaining`}>
                <small>{autoStarting ? "Starts in" : "Time left"}</small>
                <strong>{autoStarting ? autoStartCountdown : countdown}</strong>
              </div>
            </div>
            {selectedItem && !snapshot.viewerReady && (
              <div className="pick-replace-panel" role="status">
                <strong>Replace a pick with {selectedItem.title}</strong>
                <div className="actions">
                  <button onClick={() => void assignPick(1, selectedItem.catalogKey)}>Replace pick 1</button>
                  <button onClick={() => void assignPick(2, selectedItem.catalogKey)}>Replace pick 2</button>
                  <button className="text-button" onClick={() => setSelectedItem(undefined)}>Cancel</button>
                </div>
              </div>
            )}
            <div className="pick-slot-grid">
              {([1, 2] as const).map((rank) => {
                const pick = snapshot.ownSubmissions.find(
                  (item) => item.rank === rank,
                );
                return (
                  <button
                    type="button"
                    className={`pick-slot ${selectedItem && !snapshot.viewerReady ? "ready" : ""}`}
                    key={rank}
                    aria-label={
                      pick
                        ? `Pick ${rank}: ${pick.title}${selectedItem ? `. Replace with ${selectedItem.title}` : ""}`
                        : `Pick ${rank}: empty${selectedItem ? `. Place ${selectedItem.title}` : ""}`
                    }
                    onClick={() =>
                      selectedItem &&
                      void assignPick(rank, selectedItem.catalogKey)
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const catalogKey = event.dataTransfer.getData(
                        "application/watch-bracket-catalog-key",
                      );
                      if (catalogKey) void assignPick(rank, catalogKey);
                    }}
                    disabled={snapshot.viewerReady}
                  >
                    <span className="rank">Pick {rank}</span>
                    {pick ? (
                      <>
                        {pick.posterUrl ? (
                          <img src={pick.posterUrl} alt="" />
                        ) : (
                          <span className="poster-placeholder" aria-hidden="true">WB</span>
                        )}
                        <strong>{pick.title}</strong>
                      </>
                    ) : (
                      <span className="empty-pick">Empty pick {rank}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              className={snapshot.viewerReady ? "secondary" : ""}
              disabled={
                !snapshot.viewerReady && snapshot.ownSubmissions.length !== 2
              }
              onClick={() =>
                void mutate(
                  `/api/rooms/${roomId}/submissions/${snapshot.viewerReady ? "unlock" : "lock"}`,
                )
              }
            >
              {snapshot.viewerReady ? "Edit picks" : "Lock in both picks"}
            </button>
            {autoStarting && (
              <p className="notice" role="status">
                Need a change? Tap Edit picks within 10 seconds. Your unused nomination time will be restored.
              </p>
            )}
          </section>
          <section className="card stack plex-suggestions">
            <div className="actions spread">
              <span>
                <Image src="/brand/plex-logo.svg" alt="Plex" width={92} height={28} />
                <h2>For you</h2>
              </span>
              {plexConnected && (
                <small className="muted">{plexAccountLabel ?? "Connected"}</small>
              )}
            </div>
            {!plexConnected ? (
              <div className="plex-connect-row">
                <p className="muted">
                  Bring in your watchlist and taste-based suggestions.
                </p>
                <button className="plex-button" disabled={plexPending} onClick={() => void connectPlex()}>
                  <Image src="/brand/plex-logo.svg" alt="Plex" width={92} height={28} />
                  {plexPending ? "Waiting for Plex…" : "Connect my Plex"}
                </button>
              </div>
            ) : (
              <>
                {plexRecommendations.length > 0 && (
                  <>
                    <h3 className="suggestion-heading">Inspired by your taste</h3>
                    <div className="poster-grid">
                      {plexRecommendations.map((item) => (
                        <button
                          type="button"
                          className={`poster-choice ${selectedItem?.catalogKey === item.catalogKey ? "selected" : ""}`}
                          key={item.catalogKey}
                          aria-pressed={selectedItem?.catalogKey === item.catalogKey}
                          aria-label={`Pick ${item.title}`}
                          disabled={snapshot.viewerReady}
                          draggable={!snapshot.viewerReady}
                          onClick={() => chooseCandidate(item)}
                          onDragStart={(event) => {
                            setSelectedItem(item);
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData("application/watch-bracket-catalog-key", item.catalogKey);
                          }}
                        >
                          {item.posterUrl ? (
                            <img src={item.posterUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="poster-placeholder" aria-hidden="true">WB</span>
                          )}
                          <strong>{item.title}</strong>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {plexWatchlist.length > 0 && <h3 className="suggestion-heading">From your watchlist</h3>}
                <div className="poster-grid">
                  {plexWatchlist.map((item) => (
                    <button
                      type="button"
                      className={`poster-choice ${selectedItem?.catalogKey === item.catalogKey ? "selected" : ""}`}
                      key={item.catalogKey}
                      aria-pressed={selectedItem?.catalogKey === item.catalogKey}
                      aria-label={`Choose ${item.title} from your Plex watchlist`}
                      disabled={snapshot.viewerReady}
                      draggable={!snapshot.viewerReady}
                      onClick={() => chooseCandidate(item)}
                      onDragStart={(event) => {
                        setSelectedItem(item);
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(
                          "application/watch-bracket-catalog-key",
                          item.catalogKey,
                        );
                      }}
                    >
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="poster-placeholder" aria-hidden="true">WB</span>
                      )}
                      <strong>{item.title}</strong>
                    </button>
                  ))}
                </div>
                <div className="actions">
                  <button className="secondary" onClick={() => void loadPlexWatchlist()}>
                    Refresh watchlist
                  </button>
                  <button className="text-button" onClick={() => void disconnectPlex()}>
                    Disconnect Plex
                  </button>
                </div>
              </>
            )}
            {plexMessage && <p className="search-state" role="status">{plexMessage}</p>}
          </section>
          <section className="card stack">
            <div>
              <p className="kicker">Choose your top 2</p>
              <h2>Search all movies &amp; TV</h2>
              <p hidden className="muted">
                Suggestions appear as you type. Tap a poster, then choose a
                pinned slot—or drag it onto a slot.
              </p>
            </div>
            <label>
              Search for a title
              <input
                type="search"
                autoComplete="on"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Movie or show title"
              />
            </label>
            <div className="search-state" aria-live="polite">
              {searching
                ? "Finding posters…"
                : query.trim().length < 2
                  ? "Type at least two characters"
                  : `${results.length} suggestion${results.length === 1 ? "" : "s"}`}
            </div>
            {catalogWarning && <p className="notice">{catalogWarning}</p>}
            {results.length === 0 && catalogSource && (
              <p className="muted">
                No matching titles with complete runtime metadata.
              </p>
            )}
            <div className="poster-grid">
              {results.map((item) => (
                <button
                  type="button"
                  className={`poster-choice ${selectedItem?.catalogKey === item.catalogKey ? "selected" : ""}`}
                  key={item.catalogKey}
                  aria-pressed={selectedItem?.catalogKey === item.catalogKey}
                  aria-label={`Choose ${item.title}`}
                  disabled={snapshot.viewerReady}
                  draggable={!snapshot.viewerReady}
                  onClick={() => chooseCandidate(item)}
                  onDragStart={(event) => {
                    setSelectedItem(item);
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(
                      "application/watch-bracket-catalog-key",
                      item.catalogKey,
                    );
                  }}
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className="poster-placeholder" aria-hidden="true">WB</span>
                  )}
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          </section>
          {host && !autoStarting && (
            <section className="card stack">
              <h2>Host timer controls</h2>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() =>
                    void mutate(
                      `/api/rooms/${roomId}/nominations/extend`,
                      "POST",
                      { seconds: 60 },
                    )
                  }
                >
                  Add 1 minute
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    void mutate(`/api/rooms/${roomId}/nominations/close`)
                  }
                >
                  Reveal now
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {revealed && (
        <section className="card stack">
          <p className="brand">The picks are in</p>
          <h1>Keep the lineup a surprise</h1>
          <p className="muted">
            Nominations stay under wraps until they appear in the bracket.
          </p>
          {host && (
            <div className="stack">
              <h2>Build the Double-Take bracket</h2>
              <div className="actions">
                {([8, 12, 16] as const).map((size) => (
                  <button
                    className={format === size ? "" : "secondary"}
                    key={size}
                    onClick={() => setFormat(size)}
                  >
                    {size} titles
                  </button>
                ))}
              </div>
              <label>
                Seconds per vote
                <select
                  value={voteDuration}
                  onChange={(event) =>
                    setVoteDuration(Number(event.target.value))
                  }
                >
                  {[10, 20, 30, 45, 60].map((seconds) => (
                    <option value={seconds} key={seconds}>
                      {seconds} seconds
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Direct nominations are admitted first. TMDB recommendations,
                similar titles, and genre discoveries fill compatible wildcard
                slots without bypassing the room filters.
              </p>
              <button
                onClick={() =>
                  void mutate(`/api/rooms/${roomId}/tournament/start`, "POST", {
                    format,
                    voteDurationSeconds: voteDuration,
                  })
                }
              >
                Build bracket and begin
              </button>
              <details className="contender-disclosure">
                <summary>Host preview: reveal submitted titles</summary>
                {snapshot.candidates.length ? (
                  <div className="poster-grid contender-preview">
                    {snapshot.candidates.map((candidate) => (
                      <article className="poster-choice" key={candidate.catalogKey}>
                        {candidate.posterUrl ? (
                          <img src={candidate.posterUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="poster-placeholder" aria-hidden="true">WB</span>
                        )}
                        <strong>{candidate.title}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No titles were submitted.</p>
                )}
              </details>
            </div>
          )}
        </section>
      )}
      {snapshot.tournament && snapshot.state !== "NOMINATIONS_LOCKED" && (
        <section className="card stack tournament-controller">
          <div className="actions spread">
            <span>
              <span className="brand">
                {snapshot.tournament.stage.replaceAll("_", " ")}
              </span>
              <br />
              <strong>
                Matchup{" "}
                {snapshot.tournament.activeMatchup?.sequence ??
                  snapshot.tournament.completedMatchups}{" "}
                of {snapshot.tournament.totalMatchups}
              </strong>
            </span>
            {snapshot.tournament.activeMatchup && (
              <span className="controller-timer">{voteCountdown}</span>
            )}
          </div>
          {snapshot.state === "WINNER" && snapshot.tournament.champion ? (
            <div className="winner-controller">
              {host && (
                <button
                  type="button"
                  className="winner-display-toggle secondary"
                  aria-label={displayWinnerView === "BRACKET" ? "Show podium on TV" : "Show full bracket on TV"}
                  title={displayWinnerView === "BRACKET" ? "Show podium on TV" : "Show full bracket on TV"}
                  onClick={() => void toggleWinnerDisplay()}
                >
                  <WinnerViewGlyph view={displayWinnerView === "BRACKET" ? "PODIUM" : "BRACKET"} />
                </button>
              )}
              <div className="controller-confetti" aria-hidden="true">
                {Array.from({ length: 32 }, (_, index) => (
                  <i
                    key={index}
                    style={{
                      left: `${(index * 37) % 100}%`,
                      animationDelay: `${(index % 9) * -0.31}s`,
                      animationDuration: `${2.4 + (index % 5) * 0.22}s`,
                    }}
                  />
                ))}
              </div>
              <p className="winner-kicker">🏆 Tonight&apos;s feature presentation</p>
              <h1 className="winner-title">{snapshot.tournament.champion.title}</h1>
              <div className="winner-podium" aria-label="Tournament podium">
                {snapshot.tournament.podium.map((candidate, index) => (
                  <article
                    className={`podium-place podium-place-${candidate.placement}`}
                    key={`${candidate.placement}:${candidate.id}`}
                    style={{ animationDelay: `${index * 120}ms` }}
                  >
                    <span className="podium-medal">
                      {candidate.placement === 1
                        ? "1st"
                        : candidate.placement === 2
                          ? "2nd"
                          : "3rd"}
                    </span>
                    {candidate.posterUrl ? (
                      <img src={candidate.posterUrl} alt="" />
                    ) : (
                      <span className="poster-placeholder" aria-hidden="true">WB</span>
                    )}
                    <strong>{candidate.title}</strong>
                    <small>
                      {candidate.releaseYear} · Seed #{candidate.seed}
                    </small>
                  </article>
                ))}
              </div>
              <p className="winner-metadata">
                {snapshot.tournament.champion.mediaType} ·{" "}
                {snapshot.tournament.champion.releaseYear} ·{" "}
                {snapshot.tournament.champion.runtimeMinutes} min
              </p>
              {snapshot.tournament.champion.redemption && (
                <p className="notice">Returned through redemption</p>
              )}
              {!snapshot.tournament.objection && (
                <div className="objection-callout">
                  <span className="objection-burst" aria-hidden="true">!</span>
                  <div>
                    <p className="kicker">One last chance to cause a scene</p>
                    <h2>Think the podium got it wrong?</h2>
                    <p>Any one player can demand the room&apos;s single Gold + Silver overtime vote.</p>
                  </div>
                  <button className="danger objection-trigger" disabled={objectionPending} onClick={() => void raiseObjection()}>
                    {objectionPending ? "Raising objection…" : "I object!"}
                  </button>
                </div>
              )}
              {snapshot.tournament.objection && (
                <div className="objection-panel" data-status={snapshot.tournament.objection.status}>
                  <p className="objection-kicker">
                    {snapshot.tournament.objection.status === "OPEN"
                      ? `${snapshot.tournament.objection.objectorNickname} has objected!`
                      : snapshot.tournament.objection.championChanged
                        ? "Objection sustained — new podium!"
                        : "Objection overruled — the original winner holds!"}
                  </p>
                  {snapshot.tournament.objection.status === "OPEN" ? (
                    !snapshot.tournament.objection.viewerEligible ? (
                      <div className="objection-locked">
                        <strong>The overtime vote is already underway.</strong>
                        <span>You joined after the objection, so you can watch the ruling come in.</span>
                      </div>
                    ) : snapshot.tournament.objection.ownBallot ? (
                      <div className="objection-locked">
                        <strong>Your Gold + Silver ballot is locked.</strong>
                        <span>{snapshot.tournament.objection.ballotsReceived} of {snapshot.tournament.objection.eligibleVoters} players voted</span>
                      </div>
                    ) : (
                      <>
                        <div className="objection-rank-slots">
                          <button type="button" className={objectionRank === "GOLD" ? "selected" : "secondary"} onClick={() => setObjectionRank("GOLD")}>
                            <span>🥇 Gold</span>
                            <strong>{snapshot.tournament.objection.candidates.find((candidate) => candidate.id === objectionGoldId)?.title ?? "Tap a finalist"}</strong>
                          </button>
                          <button type="button" className={objectionRank === "SILVER" ? "selected" : "secondary"} onClick={() => setObjectionRank("SILVER")}>
                            <span>🥈 Silver</span>
                            <strong>{snapshot.tournament.objection.candidates.find((candidate) => candidate.id === objectionSilverId)?.title ?? "Tap a finalist"}</strong>
                          </button>
                        </div>
                        <p className="objection-prompt">
                          {!objectionGoldId ? "Pick your Gold winner" : !objectionSilverId ? "Now pick Silver" : "Ballot ready — tap a medal slot to make a change"}
                        </p>
                        <div className="objection-finalists">
                          {snapshot.tournament.objection.candidates.map((candidate) => {
                            const medal = candidate.id === objectionGoldId ? "GOLD" : candidate.id === objectionSilverId ? "SILVER" : null;
                            return (
                              <button type="button" className={`objection-finalist ${medal ? "selected" : ""}`} aria-pressed={Boolean(medal)} key={candidate.id} onClick={() => chooseObjectionCandidate(candidate.id)}>
                                <span className="matchup-poster-frame">
                                  {candidate.posterUrl ? <img src={candidate.posterUrl} alt="" /> : <span className="poster-placeholder" aria-hidden="true">WB</span>}
                                  {medal && <b className={`objection-medal ${medal.toLowerCase()}`}>{medal === "GOLD" ? "🥇" : "🥈"}</b>}
                                </span>
                                <strong>{candidate.title}</strong>
                              </button>
                            );
                          })}
                        </div>
                        <button disabled={!objectionGoldId || !objectionSilverId || objectionPending} onClick={() => void lockObjectionBallot()}>
                          {objectionPending ? "Locking ballot…" : "Lock in Gold + Silver"}
                        </button>
                        <small>{snapshot.tournament.objection.ballotsReceived} of {snapshot.tournament.objection.eligibleVoters} ballots locked · Gold = 2 points, Silver = 1</small>
                      </>
                    )
                  ) : (
                    <div className="objection-results">
                      {[...snapshot.tournament.objection.candidates]
                        .sort((a, b) => (a.finalPlacement ?? 9) - (b.finalPlacement ?? 9))
                        .map((candidate) => (
                          <article key={candidate.id}>
                            <span>{candidate.finalPlacement === 1 ? "🥇" : candidate.finalPlacement === 2 ? "🥈" : "🥉"}</span>
                            <strong>{candidate.title}</strong>
                            <small>{candidate.points} pts · {candidate.goldVotes} Gold · {candidate.silverVotes} Silver</small>
                          </article>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {snapshot.tournament.objection?.status !== "OPEN" && <div className="winner-actions">
                <div className="qr-frame"><QRCodeSVG value={winnerActionUrl} size={142} fgColor="#06194d" bgColor="#fffdf0" /></div>
                <div className="stack">
                  {snapshot.tournament.champion.localAvailability?.plexUrl && <a className="button-link winner-primary-action" href={snapshot.tournament.champion.localAvailability.plexUrl} target="_blank" rel="noreferrer" onClick={openPlexApp}>▶ Watch now on Plex</a>}
                  {!snapshot.tournament.champion.localAvailability?.plexUrl && snapshot.tournament.champion.requestAvailability?.requestUrl && <a className="button-link winner-primary-action" href={snapshot.tournament.champion.requestAvailability.requestUrl} target="_blank" rel="noreferrer">Open in Jellyseerr to request</a>}
                  {!snapshot.tournament.champion.localAvailability?.plexUrl && !snapshot.tournament.champion.requestAvailability?.requestUrl && snapshot.tournament.champion.availability?.link && <a className="button-link winner-primary-action" href={snapshot.tournament.champion.availability.link} target="_blank" rel="noreferrer">View streaming options</a>}
                  {snapshot.tournament.champion.requestAvailability?.requestable && host && <>
                    {snapshot.tournament.champion.mediaType === "TV" && <label>TV season request<select value={tvSeasonPolicy} onChange={(event)=>setTvSeasonPolicy(event.target.value as typeof tvSeasonPolicy)}><option value="FIRST">Season 1</option><option value="LATEST">Latest season</option><option value="ALL">All seasons</option></select></label>}
                    <button className="secondary" disabled={winnerActionPending} onClick={()=>void requestWinner()}>{winnerActionPending ? "Requesting…" : "Request now via Jellyseerr"}</button>
                  </>}
                  {host && <button className="secondary" disabled={winnerActionPending} onClick={()=>void replay()}>Run It Back</button>}
                  {winnerActionMessage && <p className="notice" role="status">{winnerActionMessage}</p>}
                </div>
              </div>}
              <div className="winner-path"><h2>Winner Journey</h2>{snapshot.tournament.bracket.filter((result)=>result.winnerId===snapshot.tournament!.champion!.id).map((result)=><span className="provider-badge" key={result.key}>Defeated {result.loserTitle}</span>)}</div>
              {snapshot.tournament.tasteSnapshot && (
                <div className="taste-snapshot taste-snapshot-playful">
                  <span className="taste-popcorn" aria-hidden="true">🍿</span>
                  <div>
                    <p className="kicker">The group vibe</p>
                    <h2>You guys were in the mood for {snapshot.tournament.tasteSnapshot.dominantGenres.join(" + ") || "a little bit of everything"}.</h2>
                    <p>{tasteQuip(snapshot.tournament.tasteSnapshot)}</p>
                    {snapshot.tournament.tasteSnapshot.consensusPercent !== null && <strong>{snapshot.tournament.tasteSnapshot.consensusPercent}% final-round consensus</strong>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            snapshot.tournament.activeMatchup && (
              <>
                <div className="versus">
                  {([
                    snapshot.tournament.activeMatchup.candidateA,
                    snapshot.tournament.activeMatchup.candidateB,
                  ] as const).map((candidate, index) => (
                    <button
                      type="button"
                      className={`matchup-poster-option ${selectedVoteId === candidate.id ? "selected" : ""}`}
                      key={candidate.id}
                      aria-pressed={selectedVoteId === candidate.id}
                      disabled={snapshot.state !== "VOTING"}
                      onClick={() => setSelectedVoteId(candidate.id)}
                    >
                      <small>Seed #{candidate.seed}</small>
                      <span className="matchup-poster-frame">
                        {candidate.posterUrl ? (
                          <img src={candidate.posterUrl} alt="" />
                        ) : (
                          <span className="poster-placeholder" aria-hidden="true">WB</span>
                        )}
                      </span>
                      <strong>{candidate.title}</strong>
                      <span className="matchup-metadata">
                        {candidate.releaseYear} · {candidate.genres.slice(0, 2).join(", ")}
                      </span>
                      {index === 0 && <span className="versus-burst" aria-hidden="true">VS</span>}
                    </button>
                  ))}
                </div>
                {snapshot.state === "MATCHUP_INTRO" && (
                  <p className="notice">
                    Voting opens in {voteCountdown}.
                  </p>
                )}
                {snapshot.state === "VOTING" && (
                  <div className="stack vote-lock-panel">
                    <p hidden className="muted">
                      Tap a poster, then lock it in. Your vote stays private.
                    </p>
                    <button
                      disabled={!selectedVoteId}
                      onClick={() =>
                        void mutate(
                          `/api/matchups/${snapshot.tournament!.activeMatchup!.id}/vote`,
                          "POST",
                          {
                            candidateId: selectedVoteId,
                            abstain: false,
                          },
                        )
                      }
                    >
                      {snapshot.tournament.activeMatchup.ownVote?.candidateId &&
                      snapshot.tournament.activeMatchup.ownVote.candidateId === selectedVoteId
                        ? `${selectedVoteTitle ?? "Pick"} locked in`
                        : selectedVoteTitle
                          ? `Vote for ${selectedVoteTitle}`
                          : "Choose a poster"}
                    </button>
                    <button
                      aria-pressed={snapshot.tournament.activeMatchup.ownVote?.abstained === true}
                      className="text-button"
                      onClick={() =>
                        void mutate(
                          `/api/matchups/${snapshot.tournament!.activeMatchup!.id}/vote`,
                          "POST",
                          { abstain: true },
                        )
                      }
                    >
                      Sit this matchup out
                    </button>
                  </div>
                )}
                {snapshot.state === "MATCHUP_RESULT" &&
                  snapshot.tournament.activeMatchup.resolution && (
                    <div className="notice">
                      <strong>
                        {snapshot.tournament.activeMatchup.resolution
                          .winnerId ===
                        snapshot.tournament.activeMatchup.candidateA.id
                          ? snapshot.tournament.activeMatchup.candidateA.title
                          : snapshot.tournament.activeMatchup.candidateB
                              .title}{" "}
                        advances
                      </strong>
                      <br />
                      {snapshot.tournament.activeMatchup.resolution.votesA}–
                      {snapshot.tournament.activeMatchup.resolution.votesB} ·{" "}
                      {snapshot.tournament.activeMatchup.resolution.abstentions}{" "}
                      abstained
                    </div>
                  )}
                {host && (
                  <div className="actions">
                    {snapshot.state === "VOTING" ? (
                      <button
                        className="secondary"
                        onClick={() =>
                          void mutate(
                            `/api/rooms/${roomId}/tournament/extend`,
                            "POST",
                            { seconds: 30 },
                          )
                        }
                      >
                        Add 30 seconds
                      </button>
                    ) : (
                      <button
                        className="secondary"
                        onClick={() =>
                          void mutate(
                            `/api/rooms/${roomId}/tournament/skip-presentation`,
                          )
                        }
                      >
                        Skip presentation
                      </button>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </section>
      )}
      {snapshot.tournament && snapshot.tournament.bracket.length > 0 && (
        <section className="card bracket-results-card">
          <div className="bracket-results-heading">
            <div>
              <p className="kicker">Every elimination</p>
              <h2>Bracket results</h2>
            </div>
            <strong>{snapshot.tournament.completedMatchups}/{snapshot.tournament.totalMatchups}</strong>
          </div>
          <EliminationBracket results={snapshot.tournament.bracket} />
        </section>
      )}
      {host && snapshot.state === "LOBBY" && (
        <section className="card stack">
          <h2>Display &amp; room controls</h2>
          <div className="actions">
            <button
              className="secondary"
              onClick={() =>
                void mutate(
                  `/api/rooms/${roomId}/${snapshot.locked ? "unlock" : "lock"}`,
                )
              }
            >
              {snapshot.locked ? "Unlock room" : "Lock room"}
            </button>
            <button className="secondary" onClick={pairing}>
              Pair browser display
            </button>
          </div>
          {pairingCode && (
            <p>
              Enter this on the shared display:{" "}
              <strong className="room-code" style={{ fontSize: "2rem" }}>
                {pairingCode}
              </strong>
            </p>
          )}
          {snapshot.displays
            .filter((display) => display.kind === "BROWSER")
            .map((display) => (
              <div className="person" key={display.id}>
                <span>
                  {display.connected ? "●" : "○"} {display.name}
                </span>
                <button
                  className="danger"
                  onClick={() =>
                    void mutate(`/api/displays/${display.id}`, "DELETE")
                  }
                >
                  Revoke
                </button>
              </div>
            ))}
        </section>
      )}
    </main>
  );
}
