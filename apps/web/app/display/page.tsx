'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../../components/brand-logo';

export default function DisplayPairPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/displays/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pairingCode: code, displayName: 'Living room display' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'Could not pair display');
      router.replace(`/display/${body.displaySessionId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not pair display');
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <div className="hero">
        <BrandLogo label="Shared display" />
        <h1>Connect this TV</h1>
        <p className="lead">Enter the 6-digit code shown on the host&apos;s phone.</p>
      </div>
      <form className="card stack" onSubmit={submit}>
        {error && <p className="error">{error}</p>}
        <label>
          TV code
          <input
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button disabled={loading || code.length !== 6}>
          {loading ? 'Connecting…' : 'Connect TV'}
        </button>
        <a className="text-button" href="/display/test">Presentation test mode</a>
      </form>
    </main>
  );
}
