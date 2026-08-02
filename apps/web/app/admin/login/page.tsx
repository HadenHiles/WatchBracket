'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter(); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setLoading(true); setError(''); try { const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})}); const body=await response.json(); if(!response.ok) throw new Error(body.message ?? 'Invalid email or password.'); const next=new URLSearchParams(window.location.search).get('next'); router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/'); } catch(e){setError(e instanceof Error?e.message:'Invalid email or password.');setLoading(false);} }
  return <main className="shell"><div className="brand">Watch Bracket</div><form className="card stack" onSubmit={submit}><h1>Household host sign in</h1><p className="muted">Use the private bootstrap account configured on this server.</p>{error&&<p className="error">{error}</p>}<label>Email<input type="email" autoComplete="username" required value={email} onChange={(e)=>setEmail(e.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e)=>setPassword(e.target.value)} /></label><button disabled={loading}>{loading?'Signing in…':'Sign in'}</button></form></main>;
}
