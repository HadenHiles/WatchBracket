import type { DisplayScene, LobbyScene, NominationProgressScene } from '@watch-bracket/display-protocol';
import { useEffect, useState, type CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const styles: Record<string, CSSProperties> = {
  canvas: { aspectRatio: '16/9', width: '100%', minHeight: '100vh', padding: '5vw', boxSizing: 'border-box', background: 'radial-gradient(circle at 50% 10%, #342058, #090912 60%)', color: '#fff', fontFamily: 'system-ui, sans-serif', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '5vw', alignItems: 'center' },
  code: { fontSize: 'clamp(4rem, 11vw, 10rem)', letterSpacing: '.08em', margin: '.1em 0' },
  participants: { display: 'grid', gap: '1rem', fontSize: 'clamp(1.2rem, 2.5vw, 2.4rem)' },
  person: { padding: '.7em 1em', border: '1px solid #ffffff30', borderRadius: '1rem', background: '#ffffff0d', display: 'flex', justifyContent: 'space-between', gap: '1rem' }
};

type Connection = 'connected' | 'reconnecting' | 'revoked';

export function LobbyDisplay({ scene, connection = 'connected' }: { scene: LobbyScene; connection?: Connection }) {
  return <main style={styles.canvas}>
    <section><div style={{ color: '#d5b6ff', fontWeight: 700 }}>WATCH BRACKET</div><h1>{scene.roomName}</h1><p>Join at bracket.famflix.live</p><div style={styles.code}>{scene.roomCode}</div><div style={{ background: '#fff', padding: 12, borderRadius: 14, width: 'fit-content' }}><QRCodeSVG value={scene.joinUrl} size={150}/></div><p>{scene.locked ? '🔒 Room locked' : '● Room open'} · {connection}</p></section>
    <section><h2>Tonight&apos;s crew</h2><div style={styles.participants}>{scene.participants.map((person) => <div key={person.nickname} style={styles.person}><span>{person.connected ? '●' : '○'} {person.nickname}</span><span>{person.role === 'HOST' ? 'Host' : ''}</span></div>)}</div></section>
  </main>;
}

function useSecondsRemaining(deadline: string | null) {
  const calculate = () => deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000)) : 0;
  const [seconds, setSeconds] = useState(calculate);
  useEffect(() => { setSeconds(calculate()); const timer = setInterval(() => setSeconds(calculate()), 1000); return () => clearInterval(timer); }, [deadline]);
  return seconds;
}

export function NominationProgressDisplay({ scene, connection = 'connected' }: { scene: NominationProgressScene; connection?: Connection }) {
  const seconds = useSecondsRemaining(scene.deadline);
  return <main style={{ ...styles.canvas, gridTemplateColumns: '1fr 1.25fr' }}>
    <section><div style={{ color: '#d5b6ff', fontWeight: 700 }}>WATCH BRACKET · NOMINATIONS</div><h1>{scene.roomName}</h1><div style={styles.code}>{scene.revealed ? 'REVEAL' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</div><p>{scene.submittedParticipants} of {scene.totalParticipants} players submitted · {scene.lockedParticipants} locked</p><p>{connection}</p></section>
    <section>{scene.revealed ? <><h2>The contenders</h2><div style={styles.participants}>{scene.candidates.map((candidate) => <div key={`${candidate.mediaType}:${candidate.title}`} style={styles.person}><span>{candidate.title} <small>({candidate.releaseYear})</small></span><strong>{candidate.supportCount} {candidate.supportCount === 1 ? 'supporter' : 'supporters'}</strong></div>)}</div></> : <><h2>Choose your top two</h2><p style={{ fontSize: 'clamp(1.4rem, 3vw, 2.8rem)', color: '#d7cfdf' }}>Nominations stay private until time is up. Pick a first choice and a backup on your phone.</p></>}</section>
  </main>;
}

export function RoomDisplay({ scene, connection = 'connected' }: { scene: DisplayScene; connection?: Connection }) {
  const sceneDeadline='deadline' in scene?scene.deadline:null;const seconds=useSecondsRemaining(sceneDeadline);
  if(scene.type==='LOBBY')return <LobbyDisplay scene={scene} connection={connection}/>;
  if(scene.type==='NOMINATION_PROGRESS')return <NominationProgressDisplay scene={scene} connection={connection}/>;
  if(scene.type==='WINNER')return <main style={{...styles.canvas,gridTemplateColumns:'1fr'}}><section style={{textAlign:'center'}}><div style={{color:'#fbbf24',fontWeight:900}}>WATCH BRACKET WINNER</div><h1 style={{fontSize:'clamp(4rem,10vw,9rem)',margin:'.2em'}}>{scene.winner.title}</h1><p style={{fontSize:'clamp(1.4rem,3vw,2.5rem)'}}>{scene.winner.mediaType} · {scene.winner.releaseYear} · {scene.winner.runtimeMinutes} min</p><p>{scene.winner.redemption?'Second chance champion · ':''}Seed #{scene.winner.seed}</p><div style={{display:'flex',justifyContent:'center',gap:'1rem',flexWrap:'wrap'}}>{scene.path.map((step)=><span style={styles.person} key={`${step.stage}:${step.opponentTitle}`}>Defeated {step.opponentTitle}</span>)}</div></section></main>;
  const stage=scene.stage.replaceAll('_',' ');
  if(scene.type==='MATCHUP_RESULT')return <main style={styles.canvas}><section><div style={{color:'#fbbf24',fontWeight:900}}>{stage} · MATCHUP {scene.matchupNumber} OF {scene.totalMatchups}</div><h1 style={{fontSize:'clamp(3rem,8vw,7rem)'}}>{scene.winner.title} advances</h1><p>{scene.votesWinner}–{scene.votesLoser} · {scene.abstentions} abstained</p>{scene.tieBreak&&<p>Tie decided by {scene.tieBreak.replaceAll('_',' ').toLowerCase()}</p>}</section><section><div style={{...styles.person,borderColor:'#fbbf2488',fontSize:'clamp(1.5rem,4vw,3rem)'}}><span>🏆 {scene.winner.title}</span><strong>Seed #{scene.winner.seed}</strong></div><div style={{...styles.person,opacity:.55,marginTop:'1rem'}}><span>{scene.loser.title}</span><span>{scene.loser.strikes+1} strikes</span></div></section></main>;
  const voting=scene.type==='MATCHUP_VOTING';return <main style={styles.canvas}><section><div style={{color:scene.stage.startsWith('REDEMPTION')?'#fb7185':'#d5b6ff',fontWeight:900}}>{stage} · MATCHUP {scene.matchupNumber} OF {scene.totalMatchups}</div><h1 style={{fontSize:'clamp(3rem,8vw,7rem)',margin:'.3em 0'}}>{voting?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Tonight’s next face-off'}</h1><p>{voting?`${scene.votesReceived} of ${scene.eligibleVoters} votes received`:'Get ready to vote on your phone'}</p><p>{connection}</p></section><section style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.2rem'}}>{[scene.candidateA,scene.candidateB].map((item)=><article key={item.id} style={{...styles.person,display:'block',minHeight:'40vh',padding:'1.5rem',borderColor:item.redemption?'#fb718588':'#ffffff30'}}><small>{item.redemption?'↻ REDEMPTION · ':''}SEED #{item.seed}</small><h2 style={{fontSize:'clamp(2rem,4vw,4rem)'}}>{item.title}</h2><p>{item.mediaType} · {item.releaseYear}</p><p>{item.runtimeMinutes} min · {item.contentRating}</p><p>{item.genres.slice(0,3).join(' · ')}</p></article>)}</section></main>;
}
