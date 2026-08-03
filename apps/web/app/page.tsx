'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';

export default function Home() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false); const [authenticated, setAuthenticated] = useState(false); const [creating, setCreating] = useState(false); const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('Movie Night'); const [hostNickname, setHostNickname] = useState('Host'); const [code, setCode] = useState('');
  useEffect(() => { setHydrated(true); api<{authenticated:boolean}>('/api/auth/session').then((session)=>setAuthenticated(session.authenticated)).catch(()=>setAuthenticated(false)); }, []);
  async function create(connectPlex = false) {
    const popup = connectPlex ? window.open("about:blank", "watch-bracket-plex", "popup,width=520,height=720") : null;
    setError(''); setCreating(true);
    try {
      const result = await api<{roomId:string}>('/api/rooms', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ name: roomName, hostNickname }) });
      if (connectPlex) {
        const auth = await api<{authUrl:string}>('/api/plex/auth/start', { method: 'POST', body: '{}' });
        if (popup) popup.location.href = auth.authUrl;
        else window.location.href = auth.authUrl;
      }
      router.push(`/room/${result.roomId}`);
    }
    catch (e) { popup?.close(); setError(e instanceof Error ? e.message : 'Could not create room'); setCreating(false); }
  }
  function join(event: React.FormEvent) { event.preventDefault(); router.push(`/join/${code.trim().toUpperCase()}`); }
  async function signOut() { await api('/api/auth/logout', { method: 'POST', body: '{}' }); setAuthenticated(false); }
  return <main className="shell home-shell"><header className="home-header"><div className="site-logo"><Image src="/brand/watch-bracket-wordmark.png" alt="Watch Bracket" fill priority sizes="(max-width: 680px) 72vw, 360px"/></div><p>Feature presentation selector</p></header><section className="hero home-hero"><div className="hero-copy"><h1>Tonight&apos;s pick, decided together.</h1><p className="lead">Create a room, invite the couch, and turn the endless scroll into a quick shared decision.</p></div></section>
    {error && <p className="error">{error}</p>}
    <div className="two-col">
      <section className="card stack"><div className="card-heading"><Image className="card-icon" src="/brand/vhs-tape-icon.png" alt="" width={112} height={75}/><div><p className="kicker">Tonight&apos;s feature</p><h2>Create a room</h2></div></div><label>Room name<input value={roomName} maxLength={80} onChange={(e)=>setRoomName(e.target.value)} /></label><label>Your nickname<input value={hostNickname} maxLength={32} onChange={(e)=>setHostNickname(e.target.value)} /></label><button onClick={()=>void create(false)} disabled={!hydrated || creating}>{creating?'Creating…':'Create a room'}</button><button className="plex-button" onClick={()=>void create(true)} disabled={!hydrated || creating}><Image src="/brand/plex-logo.svg" alt="Plex" width={92} height={28}/><span>Create + personalize with Plex</span></button><small className="muted">Plex is optional. It adds your watchlist and taste-based suggestions.</small></section>
      <form className="card stack" onSubmit={join}><div className="card-heading"><Image className="card-icon" src="/brand/tournament-bracket-icon.png" alt="" width={112} height={75}/><div><p className="kicker">Grab a ballot</p><h2>Join a room</h2></div></div><label>Six-character room code<input aria-label="Room code" autoCapitalize="characters" value={code} maxLength={6} onChange={(e)=>setCode(e.target.value.toUpperCase())} /></label><button className="secondary">Join Room</button><a className="display-link" href="/display"><Image src="/brand/cast-to-tv-icon.png" alt="" width={72} height={48}/><span><strong>Open shared display</strong><small>Put the bracket on the big screen</small></span></a></form>
    </div>
    <nav className="server-links" aria-label="Server administration">{authenticated?<><a href="/setup">Server settings</a><a href="/admin/recommendations">Recommendation diagnostics</a><button className="text-button" onClick={signOut}>Sign out</button></>:<a href="/admin/login?next=%2Fsetup">Server settings</a>}</nav>
    <section className="feature-reel" aria-labelledby="how-it-plays"><div className="feature-reel-heading"><p className="kicker">Be kind, rewind, decide</p><h2 id="how-it-plays">How movie night plays</h2></div><article className="feature-frame"><Image src="/brand/versus-badge-icon.png" alt="" width={160} height={107}/><div><strong>Head-to-head picks</strong><p>Vote through fast matchups instead of debating the whole catalog.</p></div></article><article className="feature-frame"><Image src="/brand/winner-trophy-icon.png" alt="" width={160} height={107}/><div><strong>Crown the winner</strong><p>One title survives the bracket and becomes tonight&apos;s feature presentation.</p></div></article></section>
  </main>;
}
