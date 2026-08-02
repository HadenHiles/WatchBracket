'use client';
import { useState } from 'react';
import { BrandLogo } from '../../../components/brand-logo';
import { api } from '../../../lib/api';

type DebugCandidate = { candidateId: string; sourceType: string; seed: number; scoreTotal: number; scoreComponents: Record<string, number>; reasonCodes: string[]; catalogKey: string; title: string; mediaType: string; releaseYear: number; runtimeMinutes: number | null; genres: string[] };

export default function RecommendationDiagnostics() {
  const [roomId,setRoomId]=useState(''); const [candidates,setCandidates]=useState<DebugCandidate[]>([]); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  async function inspect(event:React.FormEvent){event.preventDefault();setLoading(true);setError('');try{const result=await api<{candidates:DebugCandidate[]}>(`/api/admin/rooms/${encodeURIComponent(roomId.trim())}/recommendation-debug`);setCandidates(result.candidates);}catch(reason){setCandidates([]);setError(reason instanceof Error?reason.message:'Could not load candidate diagnostics.');}finally{setLoading(false);}}
  return <main className="shell stack"><BrandLogo label="Recommendation diagnostics"/><form className="card stack" onSubmit={inspect}><h1>Inspect a bracket</h1><p className="muted">Enter the room UUID from its controller URL to see the stored, reproducible scoring inputs and human-readable reasons.</p><label>Room UUID<input required value={roomId} onChange={(event)=>setRoomId(event.target.value)} placeholder="00000000-0000-4000-8000-000000000000"/></label><button disabled={loading}>{loading?'Loading…':'Inspect candidates'}</button>{error&&<p className="error">{error}</p>}</form>
    {candidates.map((candidate)=><article className="card stack" key={candidate.candidateId}><div className="actions"><span className="rank">#{candidate.seed}</span><div><h2>{candidate.title}</h2><small className="muted">{candidate.mediaType} · {candidate.releaseYear} · {candidate.runtimeMinutes??'unknown'} min · {candidate.sourceType}</small></div><strong>{candidate.scoreTotal}</strong></div><div className="score-grid">{Object.entries(candidate.scoreComponents).map(([name,value])=><span key={name}><small>{name.replaceAll(/([A-Z])/g,' $1')}</small><strong>{Number(value).toFixed(2)}</strong></span>)}</div><ul>{candidate.reasonCodes.map((reason)=><li key={reason}>{reason}</li>)}</ul><small className="muted">{candidate.catalogKey}</small></article>)}
  </main>;
}
