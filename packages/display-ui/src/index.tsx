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
  return scene.type === 'LOBBY' ? <LobbyDisplay scene={scene} connection={connection}/> : <NominationProgressDisplay scene={scene} connection={connection}/>;
}
