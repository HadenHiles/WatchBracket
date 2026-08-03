import type {
  DisplayScene,
  LobbyScene,
  NominationProgressScene,
} from "@watch-bracket/display-protocol";
import { useEffect, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";

const styles: Record<string, CSSProperties> = {
  canvas: {
    aspectRatio: "16/9",
    width: "100%",
    minHeight: "100vh",
    padding: "5vw",
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at 18% 0, #174aa2, transparent 35%), linear-gradient(145deg, #06194d, #020a25 72%)",
    borderTop: "10px solid #ffd637",
    color: "#fffbea",
    fontFamily: '"Trebuchet MS", system-ui, sans-serif',
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: "5vw",
    alignItems: "center",
  },
  brandFrame: {
    position: "relative",
    width: "clamp(180px, 22vw, 340px)",
    aspectRatio: "2.7",
    overflow: "hidden",
    marginBottom: ".6rem",
    filter: "drop-shadow(6px 7px 0 #020a25aa)",
  },
  brandImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  code: {
    color: "#ffd637",
    fontFamily: "Impact, Haettenschweiler, sans-serif",
    fontSize: "clamp(4rem, 11vw, 10rem)",
    letterSpacing: ".08em",
    lineHeight: 1,
    margin: ".1em 0",
    textShadow: "7px 7px 0 #ef3e46",
  },
  participants: {
    display: "grid",
    gap: "1rem",
    fontSize: "clamp(1.2rem, 2.5vw, 2.4rem)",
  },
  person: {
    padding: ".7em 1em",
    border: "2px solid #4e79c8",
    borderLeft: "8px solid #ffd637",
    borderRadius: ".35rem",
    background: "#082b72cc",
    boxShadow: "6px 6px 0 #020a25",
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
  },
};

type Connection = "connected" | "reconnecting" | "revoked";
const defaultLogoSrc = "/brand/watch-bracket-wordmark.png";
const motionCss = `
@keyframes wb-scene-in{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
@keyframes wb-card-in{from{opacity:0;transform:translateY(5vh) rotate(-1deg)}to{opacity:1;transform:none}}
@keyframes wb-champion{0%{opacity:0;transform:translateY(10vh) scale(.75) rotate(-4deg)}65%{transform:translateY(-1vh) scale(1.06) rotate(1deg)}100%{opacity:1;transform:none}}
@keyframes wb-confetti{0%{transform:translateY(-15vh) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}@keyframes wb-redemption{0%{opacity:0;transform:scale(.65);box-shadow:0 0 0 #ff5964}65%{transform:scale(1.06);box-shadow:0 0 55px #ff5964}100%{opacity:1;transform:none}}@keyframes wb-flyover{from{opacity:0;transform:perspective(600px) rotateX(35deg) translateY(30px)}to{opacity:1;transform:none}}
[data-wb-scene]{animation:wb-scene-in .45s ease-out both;overflow:hidden}.wb-candidate-card{animation:wb-card-in .55s cubic-bezier(.2,.8,.2,1) both}.wb-candidate-card:nth-child(2){animation-delay:.12s}.wb-candidate-card.wb-redemption{animation:wb-redemption .75s ease-out both}.wb-champion-poster{animation:wb-champion .8s cubic-bezier(.2,.9,.2,1) both}.wb-winner-path{animation:wb-flyover .8s ease-out .35s both}.wb-confetti{position:fixed;inset:0;pointer-events:none;z-index:20}.wb-confetti i{position:absolute;top:-5vh;width:1.1vw;height:2.3vw;min-width:8px;min-height:14px;background:#ffd637;animation:wb-confetti 2.8s linear infinite}.wb-confetti i:nth-child(2n){background:#ef3e46;animation-delay:.35s}.wb-confetti i:nth-child(3n){background:#50c9e8;animation-delay:.7s}.wb-confetti i:nth-child(4n){background:#fffbea;animation-delay:1.05s}.wb-display-podium{display:flex;align-items:flex-end;justify-content:center;gap:clamp(.6rem,1.4vw,1.25rem);margin:1.2rem auto}.wb-podium-place{position:relative;width:clamp(80px,8vw,135px);display:grid;gap:.25rem;padding:.35rem .35rem .65rem;border:2px solid #4e79c8;background:#031847;box-shadow:6px 7px 0 #020a25;animation:wb-champion .8s cubic-bezier(.2,.9,.2,1) both}.wb-podium-place[data-placement="1"]{order:2;width:clamp(105px,10vw,165px);padding-bottom:1.2rem;border-color:#ffd637}.wb-podium-place[data-placement="2"]{order:1}.wb-podium-place[data-placement="3"]{order:3}.wb-podium-place img,.wb-podium-place .wb-poster-fallback{width:100%;aspect-ratio:2/3;object-fit:cover}.wb-podium-place strong{font-size:clamp(.7rem,1.2vw,1.1rem);line-height:1.1}.wb-podium-medal{position:absolute;top:-.7rem;left:50%;z-index:2;padding:.15rem .45rem;border:2px solid #fff;border-radius:999px;background:#ffd637;color:#06194d;font-weight:900;transform:translateX(-50%)}[data-low-power=true] .wb-confetti{display:none}[data-low-power=true] [data-wb-scene],[data-low-power=true] .wb-candidate-card,[data-low-power=true] .wb-champion-poster,[data-low-power=true] .wb-podium-place{animation-duration:.15s;filter:none!important}@media(prefers-reduced-motion:reduce){[data-wb-scene],.wb-candidate-card,.wb-champion-poster,.wb-podium-place,.wb-winner-path{animation:none!important}.wb-confetti{display:none!important}}
`;

function BrandMark({
  src = defaultLogoSrc,
  centered = false,
}: {
  src?: string;
  centered?: boolean;
}) {
  return (
    <><style>{motionCss}</style><div
      style={{
        ...styles.brandFrame,
        marginInline: centered ? "auto" : undefined,
      }}
    >
      <img style={styles.brandImage} src={src} alt="Watch Bracket" />
    </div></>
  );
}

function AvailabilityStrip({
  availability,
}: {
  availability:
    | {
        attribution: "JustWatch";
        offers: Array<{
          providerId: number;
          providerName: string;
          category: "SUBSCRIPTION" | "FREE" | "ADS" | "RENT" | "BUY";
        }>;
      }
    | undefined;
}) {
  if (!availability?.offers.length) return null;
  return (
    <div>
      <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap" }}>
        {availability.offers.slice(0, 4).map((offer) => (
          <span
            key={`${offer.category}:${offer.providerId}`}
            style={{
              padding: ".3rem .55rem",
              border: "1px solid #ffd637",
              borderRadius: 4,
              background: "#03123ddd",
              fontSize: "clamp(.7rem,1.2vw,1rem)",
            }}
          >
            {offer.providerName} ·{" "}
            {offer.category === "SUBSCRIPTION"
              ? "Stream"
              : offer.category === "ADS"
                ? "Free with ads"
                : offer.category[0] + offer.category.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
      <small style={{ color: "#bfd2f4" }}>Streaming data by JustWatch</small>
    </div>
  );
}

export function LobbyDisplay({
  scene,
  connection = "connected",
  logoSrc = defaultLogoSrc,
  lowPower = false,
}: {
  scene: LobbyScene;
  connection?: Connection;
  logoSrc?: string;
  lowPower?: boolean;
}) {
  return (
    <main style={styles.canvas} data-wb-scene="lobby" data-low-power={lowPower}>
      <section>
        <BrandMark src={logoSrc} />
        <h1>{scene.roomName}</h1>
        <p>Join at bracket.famflix.live</p>
        <div style={styles.code}>{scene.roomCode}</div>
        <div
          style={{
            background: "#fffdf0",
            padding: 8,
            border: "4px solid #ffd637",
            borderRadius: 5,
            boxShadow: "6px 6px 0 #ef3e46",
            lineHeight: 0,
            width: "fit-content",
          }}
        >
          <QRCodeSVG
            value={scene.joinUrl}
            size={150}
            fgColor="#06194d"
            bgColor="#fffdf0"
          />
        </div>
        <p>
          {scene.locked ? "🔒 Room locked" : "● Room open"} · {connection}
        </p>
      </section>
      <section>
        <h2>Tonight&apos;s crew</h2>
        <div style={styles.participants}>
          {scene.participants.map((person) => (
            <div key={person.nickname} style={styles.person}>
              <span>
                {person.connected ? "●" : "○"} {person.nickname}
              </span>
              <span>{person.role === "HOST" ? "Host" : ""}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function useSecondsRemaining(deadline: string | null) {
  const calculate = () =>
    deadline
      ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000))
      : 0;
  const [seconds, setSeconds] = useState(calculate);
  useEffect(() => {
    setSeconds(calculate());
    const timer = setInterval(() => setSeconds(calculate()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return seconds;
}

export function NominationProgressDisplay({
  scene,
  connection = "connected",
  logoSrc = defaultLogoSrc,
  lowPower = false,
}: {
  scene: NominationProgressScene;
  connection?: Connection;
  logoSrc?: string;
  lowPower?: boolean;
}) {
  const seconds = useSecondsRemaining(scene.deadline);
  return (
    <main style={{ ...styles.canvas, gridTemplateColumns: "1fr 1.25fr" }} data-wb-scene="nominations" data-low-power={lowPower}>
      <section>
        <BrandMark src={logoSrc} />
        <div
          style={{ color: "#ffd637", fontWeight: 900, letterSpacing: ".12em" }}
        >
          NOMINATIONS
        </div>
        <h1>{scene.roomName}</h1>
        <div style={styles.code}>
          {scene.revealed
            ? "REVEAL"
            : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
        </div>
        <p>
          {scene.submittedParticipants} of {scene.totalParticipants} players
          submitted · {scene.lockedParticipants} locked
        </p>
        <p>{connection}</p>
      </section>
      <section>
        {scene.revealed ? (
          <>
            <h2>The contenders</h2>
            <div style={styles.participants}>
              {scene.candidates.map((candidate) => (
                <div
                  key={`${candidate.mediaType}:${candidate.title}`}
                  style={styles.person}
                >
                  <span>
                    {candidate.title} <small>({candidate.releaseYear})</small>
                  </span>
                  <strong>
                    {candidate.supportCount}{" "}
                    {candidate.supportCount === 1 ? "supporter" : "supporters"}
                  </strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>Choose your top two</h2>
            <p
              style={{
                fontSize: "clamp(1.4rem, 3vw, 2.8rem)",
                color: "#bfd2f4",
              }}
            >
              Nominations stay private until time is up. Pick a first choice and
              a backup on your phone.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

export function RoomDisplay({
  scene,
  connection = "connected",
  logoSrc = defaultLogoSrc,
  lowPower = false,
}: {
  scene: DisplayScene;
  connection?: Connection;
  logoSrc?: string;
  lowPower?: boolean;
}) {
  const sceneDeadline = "deadline" in scene ? scene.deadline : null;
  const seconds = useSecondsRemaining(sceneDeadline);
  if (scene.type === "LOBBY")
    return (
      <LobbyDisplay scene={scene} connection={connection} logoSrc={logoSrc} lowPower={lowPower} />
    );
  if (scene.type === "NOMINATION_PROGRESS")
    return (
      <NominationProgressDisplay
        scene={scene}
        connection={connection}
        logoSrc={logoSrc}
        lowPower={lowPower}
      />
    );
  if (scene.type === "WINNER")
    return (
      <main style={{ ...styles.canvas, gridTemplateColumns: "1.35fr .65fr" }} data-wb-scene="winner" data-low-power={lowPower}>
        <div className="wb-confetti" aria-hidden="true">{Array.from({length:28},(_,index)=><i key={index} style={{left:`${(index*37)%100}%`,animationDelay:`${(index%9)*-.31}s`,animationDuration:`${2.4+(index%5)*.22}s`}} />)}</div>
        <section style={{ textAlign: "center" }}>
          <BrandMark src={logoSrc} centered />
          <div style={{ color: "#fbbf24", fontWeight: 900 }}>WINNER</div>
          <h1 style={{ fontSize: "clamp(4rem,10vw,9rem)", margin: ".2em" }}>
            {scene.winner.title}
          </h1>
          <div className="wb-display-podium" aria-label="Tournament podium">
            {scene.podium.map((candidate, index) => (
              <article className="wb-podium-place" data-placement={candidate.placement} key={`${candidate.placement}:${candidate.id}`} style={{animationDelay:`${index*.12}s`}}>
                <span className="wb-podium-medal">{candidate.placement === 1 ? "1st" : candidate.placement === 2 ? "2nd" : "3rd"}</span>
                {candidate.posterUrl ? <img src={candidate.posterUrl} alt="" /> : <div className="wb-poster-fallback" style={styles.posterFallback}>WB</div>}
                <strong>{candidate.title}</strong>
              </article>
            ))}
          </div>
          <p style={{ fontSize: "clamp(1.4rem,3vw,2.5rem)" }}>
            {scene.winner.mediaType} · {scene.winner.releaseYear} ·{" "}
            {scene.winner.runtimeMinutes} min
          </p>
          <AvailabilityStrip availability={scene.winner.availability} />
          {scene.winner.localAvailability?.available && (
            <p style={{ color: "#7dd3fc", fontWeight: 900 }}>IN PLEX · READY TO WATCH</p>
          )}
          {scene.winner.requestAvailability?.requestable && (
            <p style={{ color: "#f0abfc", fontWeight: 900 }}>REQUESTABLE IN SEERR</p>
          )}
          <p>
            {scene.winner.redemption ? "Second chance champion · " : ""}Seed #
            {scene.winner.seed}
          </p>
          <div className="wb-winner-path"
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            {scene.path.map((step) => (
              <span
                style={styles.person}
                key={`${step.stage}:${step.opponentTitle}`}
              >
                Defeated {step.opponentTitle}
              </span>
            ))}
          </div>
        </section>
        <aside style={{ ...styles.person, display: "grid", justifyItems: "center", textAlign: "center" }}>
          <h2>{scene.actionLabel}</h2>
          <div style={{ background: "#fffdf0", padding: 10, border: "4px solid #ffd637", lineHeight: 0 }}>
            <QRCodeSVG value={scene.actionUrl} size={180} fgColor="#06194d" bgColor="#fffdf0" />
          </div>
          {scene.tasteSnapshot && (
            <div>
              <h3>Group Taste Snapshot</h3>
              <p>{scene.tasteSnapshot.dominantGenres.join(" · ") || "Anything goes"}</p>
              {scene.tasteSnapshot.consensusPercent !== null && <p>{scene.tasteSnapshot.consensusPercent}% final-round consensus</p>}
              {scene.tasteSnapshot.closestMatchup && <p>Closest call: {scene.tasteSnapshot.closestMatchup.winnerTitle} by {scene.tasteSnapshot.closestMatchup.margin}</p>}
            </div>
          )}
        </aside>
      </main>
    );
  const stage = scene.stage.replaceAll("_", " ");
  if (scene.type === "MATCHUP_RESULT")
    return (
      <main style={styles.canvas} data-wb-scene="result" data-low-power={lowPower}>
        <section>
          <BrandMark src={logoSrc} />
          <div style={{ color: "#fbbf24", fontWeight: 900 }}>
            {stage} · MATCHUP {scene.matchupNumber} OF {scene.totalMatchups}
          </div>
          <h1 style={{ fontSize: "clamp(3rem,8vw,7rem)" }}>
            {scene.winner.title} advances
          </h1>
          <p>
            {scene.votesWinner}–{scene.votesLoser} · {scene.abstentions}{" "}
            abstained
          </p>
          {scene.tieBreak && (
            <p>
              Tie decided by {scene.tieBreak.replaceAll("_", " ").toLowerCase()}
            </p>
          )}
        </section>
        <section>
          {scene.winner.posterUrl && (
            <img
              src={scene.winner.posterUrl}
              alt=""
              style={{
                width: "clamp(90px,12vw,180px)",
                aspectRatio: "2/3",
                objectFit: "cover",
                border: "4px solid #ffd637",
                marginBottom: "1rem",
              }}
            />
          )}
          <div
            style={{
              ...styles.person,
              borderColor: "#fbbf2488",
              fontSize: "clamp(1.5rem,4vw,3rem)",
            }}
          >
            <span>🏆 {scene.winner.title}</span>
            <strong>Seed #{scene.winner.seed}</strong>
          </div>
          <AvailabilityStrip availability={scene.winner.availability} />
          <div style={{ ...styles.person, opacity: 0.55, marginTop: "1rem" }}>
            <span>{scene.loser.title}</span>
            <span>{scene.loser.strikes + 1} strikes</span>
          </div>
        </section>
      </main>
    );
  const voting = scene.type === "MATCHUP_VOTING";
  return (
    <main style={styles.canvas} data-wb-scene={voting ? "voting" : "intro"} data-low-power={lowPower}>
      <section>
        <BrandMark src={logoSrc} />
        <div
          style={{
            color: scene.stage.startsWith("REDEMPTION") ? "#ff5964" : "#ffd637",
            fontWeight: 900,
          }}
        >
          {stage} · MATCHUP {scene.matchupNumber} OF {scene.totalMatchups}
        </div>
        <h1 style={{ fontSize: "clamp(3rem,8vw,7rem)", margin: ".3em 0" }}>
          {voting
            ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
            : "Tonight’s next face-off"}
        </h1>
        <p>
          {voting
            ? `${scene.votesReceived} of ${scene.eligibleVoters} votes received`
            : "Get ready to vote on your phone"}
        </p>
        <p>{connection}</p>
      </section>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.2rem",
        }}
      >
        {[scene.candidateA, scene.candidateB].map((item) => (
            <article
              className={`wb-candidate-card${item.redemption ? " wb-redemption" : ""}`}
            key={item.id}
            style={{
              ...styles.person,
              display: "block",
              minHeight: "40vh",
              padding: "1.5rem",
              borderColor: item.redemption ? "#ff596488" : "#4e79c8",
            }}
          >
            {item.posterUrl && (
              <img
                src={item.posterUrl}
                alt=""
                style={{
                  width: "clamp(76px,9vw,140px)",
                  aspectRatio: "2/3",
                  objectFit: "cover",
                  float: "right",
                  marginLeft: ".8rem",
                  border: "3px solid #ffd637",
                }}
              />
            )}
            <small>
              {item.redemption ? "↻ REDEMPTION · " : ""}SEED #{item.seed}
            </small>
            <h2 style={{ fontSize: "clamp(2rem,4vw,4rem)" }}>{item.title}</h2>
            <p>
              {item.mediaType} · {item.releaseYear}
            </p>
            <p>
              {item.runtimeMinutes} min · {item.contentRating}
            </p>
            <p>{item.genres.slice(0, 3).join(" · ")}</p>
            <AvailabilityStrip availability={item.availability} />
          </article>
        ))}
      </section>
    </main>
  );
}
