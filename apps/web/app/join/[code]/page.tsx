'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BrandLogo } from '../../../components/brand-logo';
import { api } from '../../../lib/api';

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function join(connectPlex: boolean) {
    if (!nickname.trim()) return;
    const popup = connectPlex
      ? window.open('about:blank', 'watch-bracket-plex', 'popup,width=520,height=720')
      : null;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomCode: code, nickname }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'Could not join room');
      if (connectPlex) {
        const auth = await api<{ authUrl: string }>('/api/plex/auth/start', {
          method: 'POST',
          body: '{}',
        });
        if (popup) popup.location.href = auth.authUrl;
        else window.location.href = auth.authUrl;
      }
      router.replace(`/room/${body.roomId}`);
    } catch (reason) {
      popup?.close();
      setError(reason instanceof Error ? reason.message : 'Could not join room');
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <BrandLogo label="Admit one" />
      <form className="card stack" onSubmit={(event) => { event.preventDefault(); void join(false); }}>
        <p className="muted">Joining room</p>
        <h1 className="room-code">{code.toUpperCase()}</h1>
        {error && <p className="error">{error}</p>}
        <label>
          Your nickname
          <input autoFocus autoComplete="nickname" maxLength={32} required value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <button disabled={loading}>{loading ? 'Joining…' : 'Join the room'}</button>
        <button type="button" className="plex-button" disabled={loading || !nickname.trim()} onClick={() => void join(true)}>
          <Image src="/brand/plex-logo.svg" alt="Plex" width={92} height={28} />
          <span>Join + personalize picks</span>
        </button>
        <small className="muted">Plex sign-in is optional and only affects your suggestions.</small>
      </form>
    </main>
  );
}
