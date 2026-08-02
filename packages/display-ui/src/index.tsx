import type { LobbyScene } from '@watch-bracket/display-protocol';
import type { CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const styles: Record<string, CSSProperties> = {
  canvas: { aspectRatio: '16/9', width: '100%', minHeight: '100vh', padding: '5vw', boxSizing: 'border-box', background: 'radial-gradient(circle at 50% 10%, #342058, #090912 60%)', color: '#fff', fontFamily: 'system-ui, sans-serif', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '5vw', alignItems: 'center' },
  code: { fontSize: 'clamp(4rem, 11vw, 10rem)', letterSpacing: '.12em', margin: '.1em 0' },
  participants: { display: 'grid', gap: '1rem', fontSize: 'clamp(1.2rem, 2.5vw, 2.4rem)' },
  person: { padding: '.7em 1em', border: '1px solid #ffffff30', borderRadius: '1rem', background: '#ffffff0d' }
};

export function LobbyDisplay({ scene, connection = 'connected' }: { scene: LobbyScene; connection?: 'connected' | 'reconnecting' | 'revoked' }) {
  return <main style={styles.canvas}>
    <section><div style={{ color: '#d5b6ff', fontWeight: 700 }}>WATCH BRACKET</div><h1>{scene.roomName}</h1><p>Join at bracket.famflix.live</p><div style={styles.code}>{scene.roomCode}</div><div style={{ background: '#fff', padding: 12, borderRadius: 14, width: 'fit-content' }}><QRCodeSVG value={scene.joinUrl} size={150}/></div><p>{scene.locked ? '🔒 Room locked' : '● Room open'} · {connection}</p></section>
    <section><h2>Tonight's crew</h2><div style={styles.participants}>{scene.participants.map((p) => <div key={p.nickname} style={styles.person}>{p.connected ? '●' : '○'} {p.nickname} {p.role === 'HOST' ? '· Host' : ''}</div>)}</div></section>
  </main>;
}
