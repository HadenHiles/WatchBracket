"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BrandLogo } from "../../../components/brand-logo";

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
  const [catalogSource, setCatalogSource] = useState<"TMDB" | "MOCK">();
  const [catalogWarning, setCatalogWarning] = useState("");
  const [searching, setSearching] = useState(false);
  const [rules, setRules] = useState<HouseRules>(presets.MOVIE_NIGHT);
  const [format, setFormat] = useState<8 | 12 | 16>(8);
  const [voteDuration, setVoteDuration] = useState(30);
  const [winnerActionMessage, setWinnerActionMessage] = useState("");
  const [tvSeasonPolicy, setTvSeasonPolicy] = useState<"FIRST" | "LATEST" | "ALL">("FIRST");
  const [winnerActionPending, setWinnerActionPending] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const previousState = useRef<RoomSnapshot["state"] | undefined>(undefined);
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
    for (const url of posters) if (url) { const image = new Image(); image.src = url; }
    if (!changed || !effectsEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (snapshot.state === "VOTING") navigator.vibrate?.(25);
    if (snapshot.state === "MATCHUP_RESULT") navigator.vibrate?.([35, 45, 35]);
    if (snapshot.state === "WINNER") navigator.vibrate?.([60, 50, 90]);
    if (["VOTING", "MATCHUP_RESULT", "WINNER"].includes(snapshot.state)) {
      try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.frequency.value = snapshot.state === "WINNER" ? 660 : snapshot.state === "MATCHUP_RESULT" ? 440 : 330; gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .16); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .17); oscillator.addEventListener("ended",()=>void audio.close()); } catch { /* optional feedback */ }
    }
  }, [snapshot, effectsEnabled]);
  const joinUrl = useMemo(
    () => (snapshot ? `${window.location.origin}/join/${snapshot.code}` : ""),
    [snapshot],
  );
  const countdown = useCountdown(snapshot?.nominationDeadline);
  const voteCountdown = useCountdown(
    snapshot?.tournament?.activeMatchup?.deadline,
  );
  const host = snapshot?.viewer === "HOST";
  async function mutate(path: string, method = "POST", body?: unknown) {
    setError("");
    try {
      const init: RequestInit =
        body === undefined
          ? { method }
          : { method, body: JSON.stringify(body) };
      await api(path, init);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
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
  async function search(event: React.FormEvent) {
    event.preventDefault();
    setSearching(true);
    setError("");
    try {
      const response = await api<{
        items: CatalogItem[];
        source: "TMDB" | "MOCK";
        warning?: string;
      }>(`/api/catalog/search?q=${encodeURIComponent(query)}`);
      setResults(response.items);
      setCatalogSource(response.source);
      setCatalogWarning(response.warning ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed");
    } finally {
      setSearching(false);
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
  const revealed = snapshot.state === "NOMINATIONS_LOCKED";
  const champion = snapshot.tournament?.champion;
  const winnerActionUrl = champion?.localAvailability?.plexUrl ?? champion?.availability?.link ?? window.location.href;
  const canStartCast = cast.state === "ready";
  const castButtonLabel =
    cast.state === "loading"
      ? "Finding TVs…"
      : cast.state === "connecting"
        ? "Connecting…"
        : cast.state === "connected"
          ? `Casting to ${cast.deviceName}`
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
          <span>{snapshot.locked ? "🔒 Locked" : "● Open"}</span>
        </div>
      </section>
      {host && !castDisplay && (
        <section className="card cast-callout" aria-labelledby="cast-heading">
          <div className="cast-callout-copy">
            <p className="kicker">Big-screen mode</p>
            <h2 id="cast-heading">Put the bracket on the TV</h2>
            <p className="muted">
              Open the device picker and launch Watch Bracket on an available
              Chromecast or Cast-enabled television.
            </p>
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
              <h2>Start nominations</h2>
              <p className="muted">
                Everyone privately ranks two titles. The shared display only
                shows progress until reveal.
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
                      <strong>{preset.preset.replaceAll("_", " ")}</strong>
                      <br />
                      <small>{preset.nominationDurationSeconds} seconds</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="two-col">
                <label>
                  Allowed media
                  <select
                    value={(rules.mediaTypes ?? ["MOVIE", "TV"]).join(",")}
                    onChange={(event) =>
                      setRules({
                        ...rules,
                        mediaTypes: event.target.value.split(",") as (
                          | "MOVIE"
                          | "TV"
                        )[],
                      })
                    }
                  >
                    <option value="MOVIE,TV">Movies &amp; TV</option>
                    <option value="MOVIE">Movies only</option>
                    <option value="TV">TV only</option>
                  </select>
                </label>
                <label>
                  Maximum runtime
                  <select
                    value={rules.maxRuntimeMinutes ?? ""}
                    onChange={(event) =>
                      setRules({
                        ...rules,
                        maxRuntimeMinutes: event.target.value
                          ? Number(event.target.value)
                          : null,
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
                  Availability
                  <select
                    value={rules.availabilityMode ?? "ANY"}
                    onChange={(event) =>
                      setRules({
                        ...rules,
                        availabilityMode: event.target.value as
                          | "ANY"
                          | "WATCH_NOW"
                          | "HYBRID",
                      })
                    }
                  >
                    <option value="ANY">Any title</option>
                    <option value="WATCH_NOW">Watch now</option>
                    <option value="HYBRID">Watch now or requestable</option>
                  </select>
                </label>
              </div>
              <button
                onClick={() =>
                  void mutate(
                    `/api/rooms/${roomId}/nominations/start`,
                    "POST",
                    { rules },
                  )
                }
              >
                Start nomination timer
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
                {snapshot.nominationProgress.lockedParticipants} locked in
              </p>
            </div>
            <div className="timer" aria-label={`${countdown} remaining`}>
              {countdown}
            </div>
          </section>
          <section className="card stack">
            <h2>Your ranked picks</h2>
            {[1, 2].map((rank) => {
              const pick = snapshot.ownSubmissions.find(
                (item) => item.rank === rank,
              );
              return (
                <div className="ranked-pick" key={rank}>
                  <span className="rank">#{rank}</span>
                  <span>
                    {pick ? (
                      <>
                        <strong>{pick.title}</strong>
                        <br />
                        <small className="muted">
                          {pick.mediaType} · {pick.releaseYear}
                        </small>
                      </>
                    ) : (
                      "Choose a title below"
                    )}
                  </span>
                </div>
              );
            })}
            <div className="actions">
              <button
                disabled={snapshot.ownSubmissions.length !== 2}
                onClick={() =>
                  void mutate(
                    `/api/rooms/${roomId}/submissions/${snapshot.viewerReady ? "unlock" : "lock"}`,
                  )
                }
              >
                {snapshot.viewerReady ? "Edit picks" : "Lock in both picks"}
              </button>
            </div>
          </section>
          <form className="card stack" onSubmit={search}>
            <h2>Search movies &amp; TV</h2>
            <label>
              Title
              <input
                required
                minLength={1}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try Dune or The Bear"
              />
            </label>
            <button disabled={searching}>
              {searching ? "Checking TMDB…" : "Search"}
            </button>
            {catalogWarning && <p className="notice">{catalogWarning}</p>}
            {results.length === 0 && catalogSource && (
              <p className="muted">
                No matching titles with complete runtime metadata.
              </p>
            )}
            <div className="catalog-results">
              {results.map((item) => (
                <article className="catalog-item" key={item.catalogKey}>
                  {item.posterUrl && (
                    <img
                      className="catalog-poster"
                      src={item.posterUrl}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <div>
                    <strong>{item.title}</strong>
                    <br />
                    <small className="muted">
                      {item.mediaType} · {item.releaseYear} ·{" "}
                      {item.runtimeMinutes} min · {item.contentRating} ·{" "}
                      {item.genres.join(", ")}
                    </small>
                    <p>{item.synopsis}</p>
                    {(item.localAvailability || item.requestAvailability) && (
                      <div className="provider-badges" aria-label="Home media availability">
                        {item.localAvailability?.available && (
                          <span className="provider-badge local">In Plex · Watch now</span>
                        )}
                        {item.requestAvailability?.requestable && (
                          <span className="provider-badge requestable">Seerr · Requestable</span>
                        )}
                        {item.requestAvailability && !item.requestAvailability.requestable && (
                          <span className="provider-badge local">Seerr · {item.requestAvailability.status.toLowerCase()}</span>
                        )}
                      </div>
                    )}
                    {item.availability && (
                      <div className="availability">
                        <div className="provider-badges">
                          {item.availability.offers.map((offer) => (
                            <span
                              className={`provider-badge ${offer.category.toLowerCase()}`}
                              key={`${offer.category}:${offer.providerId}`}
                            >
                              {offer.providerName} ·{" "}
                              {offer.category === "SUBSCRIPTION"
                                ? "Stream"
                                : offer.category === "ADS"
                                  ? "Free with ads"
                                  : offer.category[0] +
                                    offer.category.slice(1).toLowerCase()}
                            </span>
                          ))}
                        </div>
                        <small className="muted">
                          Streaming data by JustWatch
                          {item.availability.link && (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                href={item.availability.link}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View options
                              </a>
                            </>
                          )}
                        </small>
                      </div>
                    )}
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void mutate(
                          `/api/rooms/${roomId}/submissions/1`,
                          "PUT",
                          { catalogKey: item.catalogKey },
                        )
                      }
                    >
                      Pick #1
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void mutate(
                          `/api/rooms/${roomId}/submissions/2`,
                          "PUT",
                          { catalogKey: item.catalogKey },
                        )
                      }
                    >
                      Pick #2
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </form>
          {host && (
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
          <p className="brand">Nominations revealed</p>
          <h1>The contenders</h1>
          {snapshot.candidates.length ? (
            <div className="catalog-results">
              {snapshot.candidates.map((candidate) => (
                <article className="candidate" key={candidate.catalogKey}>
                  <span>
                    <strong>{candidate.title}</strong>
                    <br />
                    <small className="muted">
                      {candidate.mediaType} · {candidate.releaseYear} · best
                      rank #{candidate.bestRank}
                    </small>
                  </span>
                  <strong>
                    {candidate.supportCount}{" "}
                    {candidate.supportCount === 1 ? "supporter" : "supporters"}
                  </strong>
                </article>
              ))}
            </div>
          ) : (
            <p>No titles were submitted.</p>
          )}
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
              <p>🏆 Tonight&apos;s winner</p>
              {snapshot.tournament.champion.posterUrl && <img className="winner-poster" src={snapshot.tournament.champion.posterUrl} alt="" />}
              <h1>{snapshot.tournament.champion.title}</h1>
              <p>
                {snapshot.tournament.champion.mediaType} ·{" "}
                {snapshot.tournament.champion.releaseYear} ·{" "}
                {snapshot.tournament.champion.runtimeMinutes} min
              </p>
              {snapshot.tournament.champion.redemption && (
                <p className="notice">Returned through redemption</p>
              )}
              <div className="winner-actions">
                <div className="qr-frame"><QRCodeSVG value={winnerActionUrl} size={142} fgColor="#06194d" bgColor="#fffdf0" /></div>
                <div className="stack">
                  {snapshot.tournament.champion.localAvailability?.plexUrl && <a className="button-link" href={snapshot.tournament.champion.localAvailability.plexUrl} target="_blank" rel="noreferrer">Open in Plex</a>}
                  {!snapshot.tournament.champion.localAvailability?.plexUrl && snapshot.tournament.champion.availability?.link && <a className="button-link" href={snapshot.tournament.champion.availability.link} target="_blank" rel="noreferrer">View streaming options</a>}
                  {snapshot.tournament.champion.requestAvailability?.requestable && host && <>
                    {snapshot.tournament.champion.mediaType === "TV" && <label>TV season request<select value={tvSeasonPolicy} onChange={(event)=>setTvSeasonPolicy(event.target.value as typeof tvSeasonPolicy)}><option value="FIRST">Season 1</option><option value="LATEST">Latest season</option><option value="ALL">All seasons</option></select></label>}
                    <button disabled={winnerActionPending} onClick={()=>void requestWinner()}>{winnerActionPending ? "Requesting…" : "Request in Seerr"}</button>
                  </>}
                  {host && <button className="secondary" disabled={winnerActionPending} onClick={()=>void replay()}>Run It Back</button>}
                  {winnerActionMessage && <p className="notice" role="status">{winnerActionMessage}</p>}
                </div>
              </div>
              <div className="winner-path"><h2>Winner Journey</h2>{snapshot.tournament.bracket.filter((result)=>result.winnerId===snapshot.tournament!.champion!.id).map((result)=><span className="provider-badge" key={result.key}>Defeated {result.loserTitle}</span>)}</div>
              {snapshot.tournament.tasteSnapshot && <div className="taste-snapshot"><h2>Group Taste Snapshot</h2><p>{snapshot.tournament.tasteSnapshot.dominantGenres.join(" · ") || "Anything goes"}</p>{snapshot.tournament.tasteSnapshot.consensusPercent !== null && <p>{snapshot.tournament.tasteSnapshot.consensusPercent}% final-round consensus</p>}{snapshot.tournament.tasteSnapshot.closestMatchup && <p>Closest call: {snapshot.tournament.tasteSnapshot.closestMatchup.winnerTitle} by {snapshot.tournament.tasteSnapshot.closestMatchup.margin}</p>}{snapshot.tournament.tasteSnapshot.surpriseWildcard && <p>Surprise wildcard: {snapshot.tournament.tasteSnapshot.surpriseWildcard}</p>}</div>}
            </div>
          ) : (
            snapshot.tournament.activeMatchup && (
              <>
                <div className="versus">
                  <article>
                    <small>
                      Seed #{snapshot.tournament.activeMatchup.candidateA.seed}
                    </small>
                    <h2>
                      {snapshot.tournament.activeMatchup.candidateA.title}
                    </h2>
                    <p>
                      {snapshot.tournament.activeMatchup.candidateA.releaseYear}{" "}
                      ·{" "}
                      {snapshot.tournament.activeMatchup.candidateA.genres
                        .slice(0, 2)
                        .join(", ")}
                    </p>
                  </article>
                  <strong>VS</strong>
                  <article>
                    <small>
                      Seed #{snapshot.tournament.activeMatchup.candidateB.seed}
                    </small>
                    <h2>
                      {snapshot.tournament.activeMatchup.candidateB.title}
                    </h2>
                    <p>
                      {snapshot.tournament.activeMatchup.candidateB.releaseYear}{" "}
                      ·{" "}
                      {snapshot.tournament.activeMatchup.candidateB.genres
                        .slice(0, 2)
                        .join(", ")}
                    </p>
                  </article>
                </div>
                {snapshot.state === "MATCHUP_INTRO" && (
                  <p className="notice">
                    Matchup incoming. Voting opens when the intro completes.
                  </p>
                )}
                {snapshot.state === "VOTING" && (
                  <div className="stack">
                    <p className="muted">
                      Your vote stays private. You may update it until the
                      server deadline.
                    </p>
                    <button
                      aria-pressed={snapshot.tournament.activeMatchup.ownVote?.candidateId === snapshot.tournament.activeMatchup.candidateA.id}
                      className={
                        snapshot.tournament.activeMatchup.ownVote
                          ?.candidateId ===
                        snapshot.tournament.activeMatchup.candidateA.id
                          ? "vote selected"
                          : "vote"
                      }
                      onClick={() =>
                        void mutate(
                          `/api/matchups/${snapshot.tournament!.activeMatchup!.id}/vote`,
                          "POST",
                          {
                            candidateId:
                              snapshot.tournament!.activeMatchup!.candidateA.id,
                            abstain: false,
                          },
                        )
                      }
                    >
                      Vote {snapshot.tournament.activeMatchup.candidateA.title}
                    </button>
                    <button
                      aria-pressed={snapshot.tournament.activeMatchup.ownVote?.candidateId === snapshot.tournament.activeMatchup.candidateB.id}
                      className={
                        snapshot.tournament.activeMatchup.ownVote
                          ?.candidateId ===
                        snapshot.tournament.activeMatchup.candidateB.id
                          ? "vote selected"
                          : "vote"
                      }
                      onClick={() =>
                        void mutate(
                          `/api/matchups/${snapshot.tournament!.activeMatchup!.id}/vote`,
                          "POST",
                          {
                            candidateId:
                              snapshot.tournament!.activeMatchup!.candidateB.id,
                            abstain: false,
                          },
                        )
                      }
                    >
                      Vote {snapshot.tournament.activeMatchup.candidateB.title}
                    </button>
                    <button
                      aria-pressed={snapshot.tournament.activeMatchup.ownVote?.abstained === true}
                      className={
                        snapshot.tournament.activeMatchup.ownVote?.abstained
                          ? "secondary selected"
                          : "secondary"
                      }
                      onClick={() =>
                        void mutate(
                          `/api/matchups/${snapshot.tournament!.activeMatchup!.id}/vote`,
                          "POST",
                          { abstain: true },
                        )
                      }
                    >
                      Abstain from this matchup
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
        <details className="card">
          <summary>
            Bracket results ({snapshot.tournament.completedMatchups}/
            {snapshot.tournament.totalMatchups})
          </summary>
          <ol className="bracket-list">
            {snapshot.tournament.bracket.map((result) => (
              <li key={result.key}>
                <small>{result.stage.replaceAll("_", " ")}</small>
                <br />
                <strong>{result.winnerTitle}</strong> defeated{" "}
                {result.loserTitle}
              </li>
            ))}
          </ol>
        </details>
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
