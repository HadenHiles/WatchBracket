'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';

export default function Home() {
  const router = useRouter();
  const [createIntent, setCreateIntent] = useState(false);
  const [authenticated, setAuthenticated] = useState(false); const [setupRequired,setSetupRequired]=useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('Movie Night'); const [hostNickname, setHostNickname] = useState('Host'); const [code, setCode] = useState('');
  useEffect(() => { setCreateIntent(new URLSearchParams(window.location.search).get('create') === '1'); Promise.all([api<{authenticated:boolean}>('/api/auth/session'),api<{required:boolean}>('/api/setup/status')]).then(([session,setup])=>{setAuthenticated(session.authenticated);setSetupRequired(setup.required);if(session.authenticated&&setup.required)router.replace('/setup');}).finally(() => setLoading(false)); }, [router]);
  async function create() {
    if (!authenticated) { router.push(`/admin/login?next=${encodeURIComponent(setupRequired?'/setup':'/?create=1')}`); return; }
    setError(''); setLoading(true);
    try { const result = await api<{roomId:string}>('/api/rooms', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ name: roomName, hostNickname }) }); router.push(`/room/${result.roomId}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create room'); setLoading(false); }
  }
  function join(event: React.FormEvent) { event.preventDefault(); router.push(`/join/${code.trim().toUpperCase()}`); }
  async function signOut() { await api('/api/auth/logout', { method: 'POST', body: '{}' }); setAuthenticated(false); }
  return <main className="shell home-shell"><header className="home-header"><div className="site-logo"><Image src="/brand/watch-bracket-wordmark.png" alt="Watch Bracket" fill priority sizes="(max-width: 680px) 72vw, 360px"/></div><p>Feature presentation selector</p></header><section className="hero home-hero"><div className="hero-copy"><h1>Tonight&apos;s pick, decided together.</h1><p className="lead">Create a room, invite the couch, and turn the endless scroll into a quick shared decision.</p></div></section>
    {error && <p className="error">{error}</p>}
    <div className="two-col">
      <section className="card stack"><div className="card-heading"><Image className="card-icon" src="/brand/vhs-tape-icon.png" alt="" width={112} height={75}/><div><p className="kicker">Tonight&apos;s feature</p><h2>Create a room</h2></div></div>{authenticated || createIntent ? <><label>Room name<input value={roomName} maxLength={80} onChange={(e)=>setRoomName(e.target.value)} /></label><label>Your nickname<input value={hostNickname} maxLength={32} onChange={(e)=>setHostNickname(e.target.value)} /></label></> : <p className="muted">Household hosts sign in once, then join the room as a regular participant.</p>}<button onClick={create} disabled={loading}>Create a Room</button><small className="muted">{authenticated ? 'Signed in as household host' : 'Host sign-in required'}</small>{authenticated&&<><a className="button secondary" href="/setup">Setup &amp; integrations</a><button className="secondary" onClick={signOut}>Sign out</button></>}</section>
      <form className="card stack" onSubmit={join}><div className="card-heading"><Image className="card-icon" src="/brand/tournament-bracket-icon.png" alt="" width={112} height={75}/><div><p className="kicker">Grab a ballot</p><h2>Join a room</h2></div></div><label>Six-character room code<input aria-label="Room code" autoCapitalize="characters" value={code} maxLength={6} onChange={(e)=>setCode(e.target.value.toUpperCase())} /></label><button className="secondary">Join Room</button><a className="display-link" href="/display"><Image src="/brand/cast-to-tv-icon.png" alt="" width={72} height={48}/><span><strong>Open shared display</strong><small>Put the bracket on the big screen</small></span></a></form>
    </div>
    <section className="feature-reel" aria-labelledby="how-it-plays"><div className="feature-reel-heading"><p className="kicker">Be kind, rewind, decide</p><h2 id="how-it-plays">How movie night plays</h2></div><article className="feature-frame"><Image src="/brand/versus-badge-icon.png" alt="" width={160} height={107}/><div><strong>Head-to-head picks</strong><p>Vote through fast matchups instead of debating the whole catalog.</p></div></article><article className="feature-frame"><Image src="/brand/winner-trophy-icon.png" alt="" width={160} height={107}/><div><strong>Crown the winner</strong><p>One title survives the bracket and becomes tonight&apos;s feature presentation.</p></div></article></section>
  </main>;
}
