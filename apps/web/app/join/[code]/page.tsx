'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BrandLogo } from '../../../components/brand-logo';

export default function JoinPage() {
  const { code }=useParams<{code:string}>(); const router=useRouter(); const [nickname,setNickname]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setLoading(true);setError('');try{const response=await fetch('/api/rooms/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomCode:code,nickname})});const body=await response.json();if(!response.ok)throw new Error(body.message??'Could not join room');router.replace(`/room/${body.roomId}`);}catch(e){setError(e instanceof Error?e.message:'Could not join room');setLoading(false)}}
  return <main className="shell"><BrandLogo label="Admit one"/><form className="card stack" onSubmit={submit}><p className="muted">Joining room</p><h1 className="room-code">{code.toUpperCase()}</h1>{error&&<p className="error">{error}</p>}<label>Your nickname<input autoFocus autoComplete="nickname" maxLength={32} required value={nickname} onChange={(e)=>setNickname(e.target.value)} /></label><button disabled={loading}>{loading?'Joining…':'Join the room'}</button></form></main>;
}
