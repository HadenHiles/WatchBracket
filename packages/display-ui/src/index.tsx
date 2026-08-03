import type {
  DisplayScene,
  LobbyScene,
  NominationProgressScene,
} from "@watch-bracket/display-protocol";
import { useEffect, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";

const styles: Record<string, CSSProperties> = {
  canvas: {
    width: "100%",
    height: "100dvh",
    minHeight: 0,
    padding: "clamp(1rem, 3vw, 3rem)",
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
    overflow: "hidden",
  },
  brandFrame: {
    position: "relative",
    width: "clamp(220px, 26vw, 400px)",
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
  joinAddress: {
    width: "fit-content",
    margin: ".5rem 0",
    padding: ".35em .55em",
    border: "2px solid #50c9e8",
    borderRadius: ".25rem",
    background: "#031847",
    color: "#fffbea",
    fontSize: "clamp(1.25rem, 2.2vw, 2.5rem)",
    fontWeight: 900,
    boxShadow: "5px 5px 0 #020a25",
  },
  lobbyJoinRow: {
    display: "flex",
    alignItems: "center",
    gap: "1.25vw",
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
  posterFallback: {
    display: "grid",
    placeItems: "center",
    aspectRatio: "2/3",
    background: "linear-gradient(145deg, #174aa2, #031847)",
    color: "#ffd637",
    fontFamily: "Impact, sans-serif",
    fontSize: "clamp(1.4rem,4vw,3rem)",
  },
};

type Connection = "connected" | "reconnecting" | "revoked";
const defaultLogoSrc = "/brand/watch-bracket-wordmark.png";
const motionCss = `
@keyframes wb-scene-in{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
@keyframes wb-card-in{from{opacity:0;transform:translateY(5vh) rotate(-1deg)}to{opacity:1;transform:none}}
@keyframes wb-champion{0%{opacity:0;transform:translateY(10vh) scale(.75) rotate(-4deg)}65%{transform:translateY(-1vh) scale(1.06) rotate(1deg)}100%{opacity:1;transform:none}}
@keyframes wb-confetti{0%{transform:translateY(-15vh) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}@keyframes wb-redemption{0%{opacity:0;transform:scale(.65);box-shadow:0 0 0 #ff5964}65%{transform:scale(1.06);box-shadow:0 0 55px #ff5964}100%{opacity:1;transform:none}}@keyframes wb-flyover{from{opacity:0;transform:perspective(600px) rotateX(35deg) translateY(30px)}to{opacity:1;transform:none}}
[data-wb-scene]{animation:wb-scene-in .45s ease-out both;overflow:hidden}
body:has(.wb-display-canvas){margin:0!important;border-top:0!important;overflow:hidden}body:has(.wb-display-canvas)::before{display:none!important}
.wb-display-canvas{width:100%;height:100vh;height:100dvh;min-height:0!important;max-height:100vh;max-height:100dvh}
.wb-brand-frame{width:clamp(220px,26vw,400px)}
.wb-brand .wb-brand-frame{width:100%;margin:0}
.wb-lobby,.wb-nominations{gap:clamp(1.5rem,4vw,4rem)!important;padding:clamp(1.25rem,4vh,3rem) 5vw!important}.wb-lobby h1,.wb-nominations h1{margin:.15em 0;line-height:1}.wb-participants{gap:clamp(.4rem,1.2vh,.85rem)!important}.wb-participants>div{padding:clamp(.45rem,1.1vh,.7em) clamp(.65rem,1.5vw,1em)!important}.wb-lobby-qr svg{display:block;width:min(18vw,28vh,210px);height:auto}
.wb-candidate-card{animation:wb-card-in .55s cubic-bezier(.2,.8,.2,1) both}.wb-candidate-card:nth-child(3){animation-delay:.12s}.wb-candidate-card.wb-redemption{animation:wb-redemption .75s ease-out both}.wb-champion-poster{animation:wb-champion .8s cubic-bezier(.2,.9,.2,1) both}.wb-winner-path{animation:wb-flyover .8s ease-out .35s both}
.wb-confetti{position:fixed;inset:0;pointer-events:none;z-index:20}.wb-confetti i{position:absolute;top:-5vh;width:1.1vw;height:2.3vw;min-width:8px;min-height:14px;background:#ffd637;animation:wb-confetti 2.8s linear infinite}.wb-confetti i:nth-child(2n){background:#ef3e46;animation-delay:.35s}.wb-confetti i:nth-child(3n){background:#50c9e8;animation-delay:.7s}.wb-confetti i:nth-child(4n){background:#fffbea;animation-delay:1.05s}
.wb-room-badge{position:absolute;top:clamp(.8rem,2vh,1.4rem);right:clamp(1rem,2.5vw,2.5rem);z-index:12;display:flex;align-items:center;gap:.8rem;padding:.45rem .75rem;border:2px solid #50c9e8;background:#031847e8;box-shadow:4px 5px 0 #020a25}.wb-room-badge span{color:#bfd2f4;font-size:clamp(.65rem,1vw,.95rem);font-weight:800}.wb-room-badge strong{color:#ffd637;font-family:Impact,sans-serif;font-size:clamp(1.2rem,2.2vw,2.3rem);letter-spacing:.1em}
.wb-arena{position:relative;display:grid!important;grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr);gap:clamp(.4rem,1.4vh,1rem)!important;padding:clamp(.75rem,2vh,1.4rem) 3.5vw clamp(.8rem,2.5vh,1.8rem)!important}
.wb-arena-header{text-align:center;min-height:0}.wb-arena-header .wb-brand{position:absolute;top:clamp(.6rem,1.4vh,1rem);left:2.5vw;width:clamp(210px,19vw,340px)}.wb-arena-header h1{margin:.05em 0!important;font-size:clamp(2.3rem,7vh,5rem)!important;line-height:.95}.wb-arena-header p{margin:.2rem 0;line-height:1.15}
.wb-arena-floor{position:relative;display:grid;grid-template-columns:minmax(0,1fr) clamp(64px,7vw,115px) minmax(0,1fr);align-self:stretch;align-items:stretch;gap:clamp(.65rem,1.4vw,1.4rem);width:min(94vw,1500px);height:auto;min-height:0;margin:auto;padding:clamp(.65rem,1.6vh,1rem) clamp(.8rem,1.8vw,1.8rem);border:3px solid #174aa2;background:radial-gradient(circle at center,#174aa255,transparent 48%),linear-gradient(180deg,#082b72cc,#020a25);box-shadow:0 0 55px #50c9e82e,inset 0 0 45px #020a25}
.wb-arena-vs{align-self:center;display:grid;place-items:center;aspect-ratio:1;border:4px solid #fff7bc;border-radius:50%;background:#ef3e46;color:#fff;font-family:Impact,sans-serif;font-size:clamp(2rem,6vh,4.5rem);font-style:italic;box-shadow:0 0 32px #ef3e46}
.wb-arena-card{display:grid!important;grid-template-columns:minmax(120px,42%) minmax(0,1fr);align-items:center;gap:clamp(.65rem,1.4vw,1.4rem);height:100%;min-height:0!important;padding:clamp(.55rem,1.2vh,1rem)!important;text-align:left;overflow:hidden}.wb-arena-card .wb-poster,.wb-result-poster{width:100%;height:auto;max-height:100%;aspect-ratio:2/3;object-fit:cover;border:4px solid #ffd637;box-shadow:8px 9px 0 #020a25}.wb-arena-card .wb-copy{min-width:0}.wb-arena-card h2{display:-webkit-box;overflow:hidden;margin:.15em 0;font-size:clamp(1.65rem,5.4vh,4rem)!important;line-height:.95;-webkit-box-orient:vertical;-webkit-line-clamp:3}.wb-arena-card p{margin:.35em 0;line-height:1.15}
.wb-winner-shell{position:relative!important;display:grid!important;grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr) auto;height:100vh;height:100dvh;padding:clamp(.65rem,1.8vh,1.2rem) 3.5vw clamp(.65rem,1.5vh,1rem)!important;text-align:center}.wb-winner-header{min-height:0}.wb-winner-header .wb-brand-frame{width:clamp(240px,25vw,420px);margin-bottom:0}.wb-winner-header h1{font-size:clamp(2.4rem,7vh,5.5rem)!important;line-height:.92;margin:.02em 0!important}.wb-winner-stage{display:grid;grid-template-columns:minmax(0,2.25fr) minmax(230px,.75fr);align-items:center;gap:clamp(1rem,3vw,3rem);min-height:0;width:min(94vw,1450px);margin:auto}.wb-winner-stage-main{min-width:0}.wb-display-podium{display:flex;align-items:flex-end;justify-content:center;gap:clamp(.65rem,1.5vw,1.4rem);margin:clamp(.7rem,2vh,1.25rem) auto .35rem}.wb-podium-place{position:relative;width:clamp(105px,min(13vw,17vh),230px);display:grid;gap:.3rem;padding:.4rem .4rem .65rem;border:3px solid #4e79c8;background:#031847;box-shadow:7px 8px 0 #020a25;animation:wb-champion .8s cubic-bezier(.2,.9,.2,1) both}.wb-podium-place[data-placement="1"]{order:2;width:clamp(135px,min(17vw,22vh),290px);padding-bottom:.9rem;border-color:#ffd637}.wb-podium-place[data-placement="2"]{order:1}.wb-podium-place[data-placement="3"]{order:3}.wb-podium-place img,.wb-podium-place .wb-poster-fallback{width:100%;min-height:0;aspect-ratio:2/3;object-fit:cover}.wb-podium-place strong{overflow:hidden;font-size:clamp(.8rem,1.5vw,1.35rem);line-height:1.05;text-overflow:ellipsis;white-space:nowrap}.wb-podium-medal{position:absolute;top:-.8rem;left:50%;z-index:2;padding:.15rem .55rem;border:2px solid #fff;border-radius:999px;background:#ffd637;color:#06194d;font-size:clamp(.8rem,1.4vw,1.25rem);font-weight:900;transform:translateX(-50%)}
.wb-winner-meta{margin:.25rem!important;font-size:clamp(.9rem,1.8vw,1.5rem)!important}.wb-winner-action{display:grid!important;justify-items:center!important;align-content:center;gap:clamp(.45rem,1.2vh,.8rem);padding:clamp(.7rem,1.8vh,1.2rem)!important;text-align:center!important}.wb-winner-action h2{margin:0;font-size:clamp(1.25rem,2.4vw,2rem)}.wb-winner-action p{margin:.2rem 0}.wb-winner-action-qr{padding:clamp(4px,.7vh,7px)!important}.wb-winner-action-qr svg{display:block;width:min(18vw,20vh,155px);height:auto}.wb-winner-path{display:flex;justify-content:center;gap:.55rem;flex-wrap:wrap;margin-top:.35rem;min-height:0}.wb-winner-path>span{padding:.25em .6em!important;font-size:clamp(.68rem,1.1vw,.86rem)!important}
.wb-bracket-shell{position:relative!important;display:grid!important;grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr) auto;height:100vh;height:100dvh;padding:clamp(.7rem,2vh,1.25rem) 2.5vw!important}.wb-bracket-header{display:flex;align-items:center;justify-content:center;min-height:0;text-align:center}.wb-bracket-header .wb-brand{position:absolute;left:2.5vw;top:clamp(.6rem,1.4vh,1rem);width:clamp(210px,19vw,340px)}.wb-bracket-header h1{margin:.05em 0;font-size:clamp(2.3rem,6.5vh,4.6rem);line-height:.95}.wb-elimination-bracket{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(130px,1fr);gap:clamp(.45rem,1vw,1rem);min-height:0;padding:.4rem 0}.wb-bracket-round{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;min-height:0}.wb-bracket-round>h3{margin:.15rem 0 .35rem;color:#50c9e8;font-size:clamp(.65rem,1.15vw,.95rem);letter-spacing:.08em;text-align:center;text-transform:uppercase}.wb-bracket-matches{display:flex;flex-direction:column;justify-content:space-around;gap:clamp(.2rem,.7vh,.45rem);min-height:0}.wb-bracket-match{position:relative;display:grid;grid-template-rows:1fr 1fr;min-width:0;border:1px solid #4e79c8;background:#031847;box-shadow:3px 3px 0 #020a25}.wb-bracket-match::after{position:absolute;top:50%;right:calc(-1 * clamp(.5rem,1vw,1rem));width:clamp(.5rem,1vw,1rem);border-top:2px solid #4e79c8;content:""}.wb-bracket-round:last-child .wb-bracket-match::after{display:none}.wb-bracket-entry{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:.3rem;min-width:0;padding:clamp(.14rem,.45vh,.28rem) .35rem;font-size:clamp(.58rem,1vw,.78rem);line-height:1.05}.wb-bracket-entry+ .wb-bracket-entry{border-top:1px solid #174aa2}.wb-bracket-entry span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-bracket-entry strong{color:#ffd637;font-size:1.1em}.wb-bracket-entry.winner{background:#174aa255;color:#fffbea;font-weight:900}.wb-bracket-entry.eliminated{color:#829ac5;text-decoration:line-through}.wb-bracket-abstentions{position:absolute;right:.2rem;bottom:-.72rem;color:#829ac5;font-size:.52rem}.wb-taste-reveal{position:relative;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:clamp(.55rem,1.2vw,1rem);width:min(92vw,1100px);margin:.35rem auto 0;padding:clamp(.4rem,1vh,.65rem) clamp(.7rem,1.5vw,1.2rem);overflow:hidden;border:2px solid #ffd637;background:linear-gradient(100deg,#ef3e46,#9d255d 50%,#174aa2);box-shadow:5px 6px 0 #020a25;text-align:left;transform:rotate(-.25deg)}.wb-taste-icon{display:grid;place-items:center;width:clamp(42px,6vh,62px);aspect-ratio:1;border:2px solid #fff7bc;border-radius:50%;background:#ffd637;font-size:clamp(1.4rem,3.5vh,2.4rem);transform:rotate(-8deg)}.wb-taste-reveal small{display:block;color:#fff7bc;font-weight:900;letter-spacing:.12em}.wb-taste-reveal strong{display:block;font-family:Impact,sans-serif;font-size:clamp(1.05rem,2.7vh,1.8rem);letter-spacing:.025em}.wb-taste-reveal em{color:#fffbea;font-size:clamp(.68rem,1.5vh,.9rem)}
[data-low-power=true] .wb-confetti{display:none}[data-low-power=true] [data-wb-scene],[data-low-power=true] .wb-candidate-card,[data-low-power=true] .wb-champion-poster,[data-low-power=true] .wb-podium-place{animation-duration:.15s;filter:none!important}
@media(max-height:800px){.wb-display-canvas{border-top-width:6px!important}.wb-brand-frame{width:clamp(230px,25vw,340px)}.wb-lobby,.wb-nominations{padding:clamp(.85rem,2.5vh,1.25rem) 4vw!important}.wb-lobby h1,.wb-nominations h1{font-size:clamp(1.7rem,4.5vh,2.5rem)}.wb-lobby p,.wb-nominations p{margin:.45em 0}.wb-room-badge{padding:.3rem .6rem}.wb-arena-header .wb-brand,.wb-bracket-header .wb-brand{width:clamp(210px,18vw,280px)}.wb-arena-header h1{font-size:clamp(2rem,6.3vh,3.6rem)!important}.wb-arena-header p{font-size:clamp(.75rem,1.8vh,1rem)}.wb-arena-card h2{font-size:clamp(1.5rem,4.8vh,2.7rem)!important}.wb-winner-header .wb-brand-frame{width:clamp(250px,24vw,340px)}.wb-winner-action-qr svg{width:min(16vw,18vh,130px)}.wb-bracket-header h1{font-size:clamp(2rem,5.8vh,3.2rem)}.wb-taste-reveal{margin-top:0;padding:.25rem .7rem;transform:none}.wb-taste-icon{width:42px}.wb-taste-reveal small{font-size:.58rem;line-height:1}.wb-taste-reveal strong{font-size:1rem;line-height:1.05}.wb-taste-reveal em{font-size:.68rem;line-height:1}}
@media(max-aspect-ratio:4/3){.wb-lobby,.wb-nominations{grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr);text-align:center}.wb-lobby .wb-brand-frame,.wb-nominations .wb-brand-frame{margin-inline:auto}.wb-lobby-qr{margin-inline:auto}.wb-lobby>section:last-child{min-height:0}.wb-arena-floor{grid-template-columns:1fr!important;grid-template-rows:minmax(0,1fr) auto minmax(0,1fr);width:90vw;height:calc(100% - 1rem)!important}.wb-arena-card{grid-template-columns:1fr;height:100%}.wb-arena-card .wb-poster,.wb-result-poster{width:auto;max-width:100%;max-height:31vh;margin:auto}.wb-arena-card .wb-poster-fallback{width:min(46vw,260px)}.wb-arena-card .wb-copy{display:none}.wb-arena-vs{width:clamp(58px,10vw,80px);justify-self:center}.wb-winner-stage{grid-template-columns:1fr}.wb-winner-action{grid-template-columns:auto auto;justify-content:center!important}.wb-winner-action-qr{grid-row:1/3}.wb-winner-action .wb-taste{display:none}.wb-bracket-header{padding-top:70px}.wb-bracket-header h1{font-size:clamp(2rem,7vw,3.2rem)}.wb-bracket-shell .wb-elimination-bracket{grid-auto-columns:minmax(82px,1fr);gap:.25rem}.wb-bracket-shell .wb-bracket-entry{font-size:.54rem;padding:.16rem .2rem}.wb-bracket-shell .wb-bracket-round>h3{font-size:.56rem;letter-spacing:0}.wb-taste-reveal{width:min(94vw,1100px)}}
@media(prefers-reduced-motion:reduce){[data-wb-scene],.wb-candidate-card,.wb-champion-poster,.wb-podium-place,.wb-winner-path{animation:none!important}.wb-confetti{display:none!important}}
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
      className="wb-brand-frame"
      style={{
        ...styles.brandFrame,
        marginInline: centered ? "auto" : undefined,
      }}
    >
      <img style={styles.brandImage} src={src} alt="Watch Bracket" />
    </div></>
  );
}

function displayPosterSource(source: string) {
  try {
    const url = new URL(source);
    const match = url.pathname.match(
      /^\/t\/p\/(w92|w154|w185|w342|w500|w780|original)\/([A-Za-z0-9_-]+\.(?:avif|jpg|jpeg|png|webp))$/,
    );
    if (url.hostname === "image.tmdb.org" && match)
      return `/artwork/tmdb/${match[1]}/${match[2]}`;
  } catch {
    // Preserve non-TMDB artwork URLs; the image error fallback handles them.
  }
  return source;
}

function Poster({
  source,
  title,
  className,
  style,
}: {
  source?: string | null | undefined;
  title: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  if (!source || failed)
    return (
      <div
        className={`wb-poster-fallback${className ? ` ${className}` : ""}`}
        style={{ ...styles.posterFallback, ...style }}
        aria-label={`${title} poster unavailable`}
      >
        WB
      </div>
    );
  return (
    <img
      className={className}
      src={displayPosterSource(source)}
      alt={`${title} poster`}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}

function RoomJoinBadge({ roomCode }: { roomCode: string }) {
  return (
    <aside className="wb-room-badge" aria-label={`Join room ${roomCode}`}>
      <span>vote.famflix.live</span>
      <strong>{roomCode}</strong>
    </aside>
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
    <main className="wb-display-canvas wb-lobby" style={{ ...styles.canvas, gridTemplateColumns: "1.35fr 1fr", gap: "3vw" }} data-wb-scene="lobby" data-low-power={lowPower}>
      <section>
        <BrandMark src={logoSrc} />
        <h1>{scene.roomName}</h1>
        <p style={styles.joinAddress}>Join at {new URL(scene.joinUrl).host}</p>
        <div style={styles.lobbyJoinRow}>
          <div style={{ ...styles.code, margin: 0, fontSize: "clamp(4rem, 7vw, 8rem)" }}>{scene.roomCode}</div>
          <div
            className="wb-lobby-qr"
            style={{
              background: "#fffdf0",
              padding: 8,
              border: "4px solid #ffd637",
              borderRadius: 5,
              boxShadow: "6px 6px 0 #ef3e46",
              lineHeight: 0,
              width: "fit-content",
              flex: "0 0 auto",
            }}
          >
            <QRCodeSVG
              value={scene.joinUrl}
              size={210}
              fgColor="#06194d"
              bgColor="#fffdf0"
            />
          </div>
        </div>
        <p>
          {scene.locked ? "🔒 Room locked" : "● Room open"} · {connection}
        </p>
      </section>
      <section>
        <h2>Tonight&apos;s crew</h2>
        <div className="wb-participants" style={styles.participants}>
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
  const autoStartSeconds = useSecondsRemaining(scene.autoStartAt);
  const autoStarting = scene.autoStartAt !== null;
  return (
    <main className="wb-display-canvas wb-nominations" style={{ ...styles.canvas, gridTemplateColumns: "1fr 1.25fr" }} data-wb-scene="nominations" data-low-power={lowPower}>
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
            : autoStarting
              ? `0:${String(autoStartSeconds).padStart(2, "0")}`
            : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
        </div>
        <p>
          {scene.submittedParticipants} of {scene.totalParticipants} players
          submitted · {scene.lockedParticipants} locked
        </p>
        <p>{connection}</p>
        {autoStarting && (
          <p style={{ color: "#ffd637", fontWeight: 900 }}>
            Everyone is locked in · tournament starting automatically
          </p>
        )}
      </section>
      <section>
        {scene.revealed ? (
          <>
            <h2>The contenders</h2>
            <div className="wb-participants" style={styles.participants}>
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

function LegacyRoomDisplay({
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
      <main className="wb-display-canvas" style={{ ...styles.canvas, gridTemplateColumns: "1.35fr .65fr" }} data-wb-scene="winner" data-low-power={lowPower}>
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
      <main className="wb-display-canvas" style={styles.canvas} data-wb-scene="result" data-low-power={lowPower}>
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
    <main className="wb-display-canvas" style={styles.canvas} data-wb-scene={voting ? "voting" : "intro"} data-low-power={lowPower}>
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

export type BracketResult = Extract<DisplayScene, { type: "WINNER" }>["bracket"][number];

const bracketStageOrder: BracketResult["stage"][] = [
  "QUALIFIER",
  "SPOTLIGHT",
  "REDEMPTION",
  "REDEMPTION_FINAL",
  "CHAMPIONSHIP_PLAY_IN",
  "CHAMPIONSHIP_SEMI",
  "CHAMPIONSHIP_FINAL",
];

export function EliminationBracket({ results }: { results: BracketResult[] }) {
  const rounds = bracketStageOrder.flatMap((stage) => {
    const matches = results
      .filter((result) => result.stage === stage)
      .sort((left, right) => left.sequence - right.sequence);
    return matches.length ? [{ stage, matches }] : [];
  });
  return (
    <div className="wb-elimination-bracket" aria-label="Elimination bracket results">
      {rounds.map(({ stage, matches }) => (
        <section className="wb-bracket-round" key={stage}>
          <h3>{stage.replaceAll("_", " ")}</h3>
          <div className="wb-bracket-matches">
            {matches.map((match) => (
              <article className="wb-bracket-match" key={match.key}>
                <div className="wb-bracket-entry winner">
                  <span title={match.winnerTitle}>{match.winnerTitle}</span>
                  <strong aria-label={`${match.winnerVotes} votes`}>{match.winnerVotes}</strong>
                </div>
                <div className="wb-bracket-entry eliminated">
                  <span title={match.loserTitle}>{match.loserTitle}</span>
                  <strong aria-label={`${match.loserVotes} votes`}>{match.loserVotes}</strong>
                </div>
                {match.abstentions > 0 && <small className="wb-bracket-abstentions">+{match.abstentions} abstain</small>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TasteReveal({ taste }: { taste: Extract<DisplayScene, { type: "WINNER" }>["tasteSnapshot"] }) {
  if (!taste) return null;
  const mood = taste.dominantGenres.length
    ? taste.dominantGenres.join(" + ")
    : "a little bit of everything";
  const quip =
    taste.consensusPercent !== null && taste.consensusPercent >= 75
      ? "The group chat actually agreed. Historic."
      : taste.closestMatchup?.margin === 1
        ? "A one-vote nail-biter. Excellent drama before the movie even starts."
        : taste.surpriseWildcard
          ? `Plot twist: ${taste.surpriseWildcard} crashed the party.`
          : "The couch understood the assignment.";
  return (
    <div className="wb-taste-reveal">
      <span className="wb-taste-icon" aria-hidden="true">🍿</span>
      <div>
        <small>THE GROUP VIBE</small>
        <strong>You guys were in the mood for {mood}.</strong>
        <em>{quip}</em>
      </div>
    </div>
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
  const winnerKey = scene.type === "WINNER" ? `${scene.roomCode}:${scene.winner.id}` : "";
  const [showWinnerBracket, setShowWinnerBracket] = useState(false);
  useEffect(() => {
    if (scene.type !== "WINNER") {
      setShowWinnerBracket(false);
      return;
    }
    if (scene.displayMode !== "AUTO") {
      setShowWinnerBracket(scene.displayMode === "BRACKET");
      return;
    }
    setShowWinnerBracket(false);
    const timer = window.setTimeout(() => setShowWinnerBracket(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [scene.type, scene.type === "WINNER" ? scene.displayMode : null, winnerKey]);

  if (scene.type === "LOBBY" || scene.type === "NOMINATION_PROGRESS")
    return <LegacyRoomDisplay scene={scene} connection={connection} logoSrc={logoSrc} lowPower={lowPower} />;

  if (scene.type === "WINNER" && showWinnerBracket)
    return (
      <main className="wb-display-canvas wb-bracket-shell" style={styles.canvas} data-wb-scene="winner-bracket" data-low-power={lowPower}>
        <RoomJoinBadge roomCode={scene.roomCode} />
        <header className="wb-bracket-header">
          <div className="wb-brand"><BrandMark src={logoSrc} /></div>
          <div>
            <small style={{ color: "#fbbf24", fontWeight: 900, letterSpacing: ".12em" }}>THE ROAD TO THE WINNER</small>
            <h1>How {scene.winner.title} won</h1>
          </div>
        </header>
        <EliminationBracket results={scene.bracket} />
        <TasteReveal taste={scene.tasteSnapshot} />
      </main>
    );

  if (scene.type === "WINNER")
    return (
      <main
        className="wb-display-canvas wb-winner-shell"
        style={{ ...styles.canvas, position: "relative", textAlign: "center" }}
        data-wb-scene="winner"
        data-low-power={lowPower}
      >
        <RoomJoinBadge roomCode={scene.roomCode} />
        <div className="wb-confetti" aria-hidden="true">
          {Array.from({ length: 28 }, (_, index) => (
            <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 9) * -.31}s`, animationDuration: `${2.4 + (index % 5) * .22}s` }} />
          ))}
        </div>
        <header className="wb-winner-header">
          <BrandMark src={logoSrc} centered />
          <div style={{ color: "#fbbf24", fontWeight: 900 }}>TONIGHT&apos;S WINNER</div>
          <h1>{scene.winner.title}</h1>
        </header>
        <section className="wb-winner-stage">
          <div className="wb-winner-stage-main">
            <div className="wb-display-podium" aria-label="Tournament podium">
              {scene.podium.map((candidate, index) => (
                <article className="wb-podium-place" data-placement={candidate.placement} key={`${candidate.placement}:${candidate.id}`} style={{ animationDelay: `${index * .12}s` }}>
                  <span className="wb-podium-medal">{candidate.placement === 1 ? "1st" : candidate.placement === 2 ? "2nd" : "3rd"}</span>
                  <Poster source={candidate.posterUrl} title={candidate.title} />
                  <strong>{candidate.title}</strong>
                </article>
              ))}
            </div>
            <p className="wb-winner-meta">
              {scene.winner.mediaType} · {scene.winner.releaseYear} · {scene.winner.runtimeMinutes} min · Seed #{scene.winner.seed}
            </p>
            <AvailabilityStrip availability={scene.winner.availability} />
          </div>
          <aside className="wb-winner-action" style={styles.person}>
            <h2>{scene.actionLabel}</h2>
            <div className="wb-winner-action-qr" style={{ background: "#fffdf0", padding: 6, border: "3px solid #ffd637", lineHeight: 0 }}>
              <QRCodeSVG value={scene.actionUrl} size={140} fgColor="#06194d" bgColor="#fffdf0" />
            </div>
            {scene.winner.localAvailability?.available && <p style={{ color: "#7dd3fc", fontWeight: 900 }}>IN PLEX · READY TO WATCH</p>}
            {scene.winner.requestAvailability?.requestable && <p style={{ color: "#f0abfc", fontWeight: 900 }}>REQUESTABLE IN SEERR</p>}
          </aside>
        </section>
        <footer>
          <div className="wb-winner-path">
            {scene.path.slice(-4).map((step) => (
              <span style={styles.person} key={`${step.stage}:${step.opponentTitle}`}>Defeated {step.opponentTitle}</span>
            ))}
          </div>
        </footer>
      </main>
    );

  const stage = scene.stage.replaceAll("_", " ");
  if (scene.type === "MATCHUP_RESULT")
    return (
      <main className="wb-display-canvas wb-arena" style={styles.canvas} data-wb-scene="result" data-low-power={lowPower}>
        <RoomJoinBadge roomCode={scene.roomCode} />
        <header className="wb-arena-header">
          <div className="wb-brand"><BrandMark src={logoSrc} /></div>
          <div style={{ color: "#fbbf24", fontWeight: 900 }}>{stage} · MATCHUP {scene.matchupNumber} OF {scene.totalMatchups}</div>
          <h1>{scene.winner.title} advances</h1>
          <p>{scene.votesWinner}–{scene.votesLoser} · {scene.abstentions} abstained</p>
          {scene.tieBreak && <p>Tie decided by {scene.tieBreak.replaceAll("_", " ").toLowerCase()}</p>}
        </header>
        <section className="wb-arena-floor" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(220px,.5fr)" }}>
          <article className="wb-arena-card wb-candidate-card" style={{ ...styles.person, borderColor: "#fbbf24" }}>
            <Poster source={scene.winner.posterUrl} title={scene.winner.title} className="wb-result-poster" />
            <div className="wb-copy">
              <small>🏆 ADVANCES · SEED #{scene.winner.seed}</small>
              <h2>{scene.winner.title}</h2>
              <AvailabilityStrip availability={scene.winner.availability} />
            </div>
          </article>
          <article style={{ ...styles.person, display: "grid", opacity: .62, textAlign: "center" }}>
            <small>ELIMINATED</small>
            <strong style={{ fontSize: "clamp(1.5rem,3vw,3rem)" }}>{scene.loser.title}</strong>
            <span>{scene.loser.strikes + 1} strikes</span>
          </article>
        </section>
      </main>
    );

  const voting = scene.type === "MATCHUP_VOTING";
  return (
    <main className="wb-display-canvas wb-arena" style={styles.canvas} data-wb-scene={voting ? "voting" : "intro"} data-low-power={lowPower}>
      <RoomJoinBadge roomCode={scene.roomCode} />
      <header className="wb-arena-header">
        <div className="wb-brand"><BrandMark src={logoSrc} /></div>
        <div style={{ color: scene.stage.startsWith("REDEMPTION") ? "#ff5964" : "#ffd637", fontWeight: 900 }}>
          {stage} · MATCHUP {scene.matchupNumber} OF {scene.totalMatchups}
        </div>
        <h1>{voting ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Tonight’s next face-off"}</h1>
        <p>{voting ? `${scene.votesReceived} of ${scene.eligibleVoters} votes received` : "Get ready to vote on your phone"}</p>
        <p>{connection}</p>
      </header>
      <section className="wb-arena-floor">
        {[scene.candidateA, scene.candidateB].map((item, index) => (
          <div key={item.id} style={{ display: "contents" }}>
            {index === 1 && <div className="wb-arena-vs">VS</div>}
            <article className={`wb-arena-card wb-candidate-card${item.redemption ? " wb-redemption" : ""}`} style={{ ...styles.person, borderColor: item.redemption ? "#ff596488" : "#4e79c8" }}>
              <Poster source={item.posterUrl} title={item.title} className="wb-poster" />
              <div className="wb-copy">
                <small>{item.redemption ? "↻ REDEMPTION · " : ""}SEED #{item.seed}</small>
                <h2>{item.title}</h2>
                <p>{item.mediaType} · {item.releaseYear}</p>
                <p>{item.runtimeMinutes} min · {item.contentRating}</p>
                <p>{item.genres.slice(0, 3).join(" · ")}</p>
                <AvailabilityStrip availability={item.availability} />
              </div>
            </article>
          </div>
        ))}
      </section>
    </main>
  );
}
