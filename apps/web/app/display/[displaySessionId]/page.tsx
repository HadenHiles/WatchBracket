'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { io } from 'socket.io-client';
import { DisplayEnvelopeSchema, type LobbyScene } from '@watch-bracket/display-protocol';
import { LobbyDisplay } from '@watch-bracket/display-ui';
import { RoomSnapshotSchema, ServerEnvelopeSchema } from '@watch-bracket/realtime-protocol';
import { api } from '../../../lib/api';

function sceneFromSnapshot(value: unknown): LobbyScene {const snap=RoomSnapshotSchema.parse(value);return{type:'LOBBY',roomName:snap.name,roomCode:snap.code,joinUrl:`${window.location.origin}/join/${snap.code}`,locked:snap.locked,participants:snap.participants.map(({nickname,role,connected})=>({nickname,role,connected}))};}
export default function ActiveDisplay(){const{displaySessionId}=useParams<{displaySessionId:string}>();const[scene,setScene]=useState<LobbyScene>();const[state,setState]=useState<'connected'|'reconnecting'|'revoked'>('reconnecting');const roomId=useRef('');const sequence=useRef(0);
  const load=useCallback(async()=>{const snapshot=RoomSnapshotSchema.parse(await api<unknown>(`/api/rooms/${roomId.current}/snapshot`));sequence.current=snapshot.sequence;setScene(sceneFromSnapshot(snapshot));},[]);
  useEffect(()=>{let socket:ReturnType<typeof io>|undefined;let disposed=false;void api<unknown>(`/api/displays/${displaySessionId}/snapshot`).then((value)=>{const snap=RoomSnapshotSchema.parse(value);if(disposed)return;roomId.current=snap.roomId;sequence.current=snap.sequence;setScene(sceneFromSnapshot(snap));socket=io({path:'/socket.io',withCredentials:true});socket.on('connect',()=>{setState('connected');socket!.emit('display:subscribe',{roomId:snap.roomId,displaySessionId});});socket.on('display:snapshot',(input:unknown)=>{const outer=ServerEnvelopeSchema.safeParse(input);if(!outer.success)return;const next=RoomSnapshotSchema.safeParse(outer.data.payload);if(!next.success)return;sequence.current=next.data.sequence;setScene(sceneFromSnapshot(next.data));});socket.on('display:scene',(input:unknown)=>{const parsed=DisplayEnvelopeSchema.safeParse(input);if(!parsed.success)return;if(sequence.current&&parsed.data.sequence>sequence.current+1){void load();return;}if(parsed.data.sequence>=sequence.current){sequence.current=parsed.data.sequence;setScene(parsed.data.scene);}});socket.on('display:revoked',()=>{setState('revoked');socket?.disconnect();});socket.on('disconnect',(reason)=>{if(reason!=='io client disconnect')setState('reconnecting');});}).catch(()=>setState('revoked'));return()=>{disposed=true;socket?.disconnect();};},[displaySessionId,load]);
  if(state==='revoked')return <LobbyDisplay connection="revoked" scene={scene??{type:'LOBBY',roomName:'Display revoked',roomCode:'—',joinUrl:'https://bracket.famflix.live',locked:true,participants:[]}}/>;
  if(!scene)return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#090912',color:'white',fontFamily:'system-ui'}}><div><strong>WATCH BRACKET</strong><h1>Connecting to the lobby…</h1><p>If this takes too long, pair the display again.</p></div></main>;
  return <LobbyDisplay scene={scene} connection={state}/>;
}
