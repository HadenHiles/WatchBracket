'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { io } from 'socket.io-client';
import { DisplayEnvelopeSchema, type DisplayScene } from '@watch-bracket/display-protocol';
import { RoomDisplay } from '@watch-bracket/display-ui';
import { RoomSnapshotSchema, ServerEnvelopeSchema } from '@watch-bracket/realtime-protocol';
import { api } from '../../../lib/api';

function sceneFromSnapshot(value: unknown): DisplayScene {
  const snapshot=RoomSnapshotSchema.parse(value);
  if(snapshot.state==='LOBBY'||snapshot.state==='EXPIRED')return{type:'LOBBY',roomName:snapshot.name,roomCode:snapshot.code,joinUrl:`${window.location.origin}/join/${snapshot.code}`,locked:snapshot.locked,participants:snapshot.participants.map(({nickname,role,connected})=>({nickname,role,connected}))};
  return{type:'NOMINATION_PROGRESS',roomName:snapshot.name,roomCode:snapshot.code,deadline:snapshot.nominationDeadline,submittedParticipants:snapshot.nominationProgress.submittedParticipants,lockedParticipants:snapshot.nominationProgress.lockedParticipants,totalParticipants:snapshot.nominationProgress.totalParticipants,revealed:snapshot.nominationsRevealed,candidates:snapshot.candidates.map(({title,mediaType,releaseYear,supportCount})=>({title,mediaType,releaseYear,supportCount}))};
}
export default function ActiveDisplay(){const{displaySessionId}=useParams<{displaySessionId:string}>();const[scene,setScene]=useState<DisplayScene>();const[state,setState]=useState<'connected'|'reconnecting'|'revoked'>('reconnecting');const roomId=useRef('');const sequence=useRef(0);
  const load=useCallback(async()=>{const snapshot=RoomSnapshotSchema.parse(await api<unknown>(`/api/rooms/${roomId.current}/snapshot`));sequence.current=snapshot.sequence;setScene(sceneFromSnapshot(snapshot));},[]);
  useEffect(()=>{let socket:ReturnType<typeof io>|undefined;let disposed=false;void api<unknown>(`/api/displays/${displaySessionId}/snapshot`).then((value)=>{const snapshot=RoomSnapshotSchema.parse(value);if(disposed)return;roomId.current=snapshot.roomId;sequence.current=snapshot.sequence;setScene(sceneFromSnapshot(snapshot));socket=io({path:'/socket.io',withCredentials:true});socket.on('connect',()=>{setState('connected');socket!.emit('display:subscribe',{roomId:snapshot.roomId,displaySessionId});});socket.on('display:snapshot',(input:unknown)=>{const outer=ServerEnvelopeSchema.safeParse(input);if(!outer.success)return;const next=RoomSnapshotSchema.safeParse(outer.data.payload);if(!next.success)return;sequence.current=next.data.sequence;setScene(sceneFromSnapshot(next.data));});socket.on('display:scene',(input:unknown)=>{const parsed=DisplayEnvelopeSchema.safeParse(input);if(!parsed.success)return;if(sequence.current&&parsed.data.sequence>sequence.current+1){void load();return;}if(parsed.data.sequence>=sequence.current){sequence.current=parsed.data.sequence;setScene(parsed.data.scene);}});socket.on('display:revoked',()=>{setState('revoked');socket?.disconnect();});socket.on('disconnect',(reason)=>{if(reason!=='io client disconnect')setState('reconnecting');});}).catch(()=>setState('revoked'));return()=>{disposed=true;socket?.disconnect();};},[displaySessionId,load]);
  if(state==='revoked')return <RoomDisplay connection="revoked" scene={scene??{type:'LOBBY',roomName:'Display revoked',roomCode:'—',joinUrl:'https://bracket.famflix.live',locked:true,participants:[]}}/>;
  if(!scene)return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#090912',color:'white',fontFamily:'system-ui'}}><div><strong>WATCH BRACKET</strong><h1>Connecting to the room…</h1><p>If this takes too long, pair the display again.</p></div></main>;
  return <RoomDisplay scene={scene} connection={state}/>;
}
