'use client';
import { useEffect, useState } from 'react';
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
  return <main className="shell"><section className="hero"><div className="brand">Watch Bracket</div><h1>Tonight's pick, decided together.</h1><p className="lead">Create a room, invite the couch, and turn the endless scroll into a quick shared decision.</p></section>
    {error && <p className="error">{error}</p>}
    <div className="two-col">
      <section className="card stack"><h2>Create a room</h2>{authenticated || createIntent ? <><label>Room name<input value={roomName} maxLength={80} onChange={(e)=>setRoomName(e.target.value)} /></label><label>Your nickname<input value={hostNickname} maxLength={32} onChange={(e)=>setHostNickname(e.target.value)} /></label></> : <p className="muted">Household hosts sign in once, then join the room as a regular participant.</p>}<button onClick={create} disabled={loading}>Create a Room</button><small className="muted">{authenticated ? 'Signed in as household host' : 'Host sign-in required'}</small>{authenticated&&<><a className="button secondary" href="/setup">Setup &amp; integrations</a><button className="secondary" onClick={signOut}>Sign out</button></>}</section>
      <form className="card stack" onSubmit={join}><h2>Join a room</h2><label>Six-character room code<input aria-label="Room code" autoCapitalize="characters" value={code} maxLength={6} onChange={(e)=>setCode(e.target.value.toUpperCase())} /></label><button className="secondary">Join Room</button><a href="/display">Open shared display</a></form>
    </div></main>;
}
