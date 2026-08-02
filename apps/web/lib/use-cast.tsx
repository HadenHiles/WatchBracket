'use client';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { CAST_NAMESPACE, CastLaunchEnvelopeSchema } from '@watch-bracket/display-protocol';
import { api } from './api';

type CastSession = { sendMessage(namespace: string, data: unknown): Promise<unknown>; getCastDevice(): { friendlyName?: string }; endSession(stopCasting: boolean): void };
type CastContext = {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: unknown; resumeSavedSession: boolean }): void;
  addEventListener(type: string, handler: (event: { sessionState: string }) => void): void;
  removeEventListener(type: string, handler: (event: { sessionState: string }) => void): void;
  getCurrentSession(): CastSession | null;
  requestSession(): Promise<unknown>;
  endCurrentSession(stopCasting: boolean): void;
};
type CastGlobals = {
  cast: { framework: { CastContext: { getInstance(): CastContext }; CastContextEventType: { SESSION_STATE_CHANGED: string }; SessionState: Record<string,string> } };
  chrome: { cast: { AutoJoinPolicy: { ORIGIN_SCOPED: unknown } } };
};
declare global { interface Window { __onGCastApiAvailable?: (available: boolean) => void; cast?: CastGlobals['cast']; chrome?: CastGlobals['chrome']; } }

export type CastUiState = 'disabled'|'loading'|'ready'|'connecting'|'connected'|'error';
export function useCast({ enabled, roomId, activeDisplay }: { enabled: boolean; roomId: string; activeDisplay: { id: string; connected: boolean }|undefined }) {
  const [state,setState]=useState<CastUiState>('disabled'); const [deviceName,setDeviceName]=useState('TV'); const [message,setMessage]=useState('');
  const contextRef=useRef<CastContext|undefined>(undefined); const activeRef=useRef(activeDisplay); activeRef.current=activeDisplay;
  const appId=process.env.NEXT_PUBLIC_CAST_RECEIVER_APP_ID ?? '';
  const sendLaunch=useCallback(async(session:CastSession,force=false)=>{
    if(!force&&activeRef.current?.connected){setState('connected');setDeviceName(session.getCastDevice().friendlyName??'TV');return;}
    setState('connecting');setDeviceName(session.getCastDevice().friendlyName??'TV');
    try{const issued=await api<{launchToken:string;protocolVersion:1}>(`/api/rooms/${roomId}/cast-launch-tokens`,{method:'POST',body:'{}'});const launch=CastLaunchEnvelopeSchema.parse({type:'WATCH_BRACKET_LAUNCH',schemaVersion:issued.protocolVersion,launchToken:issued.launchToken});await session.sendMessage(CAST_NAMESPACE,launch);setState('connected');setMessage('');}catch(error){setState('error');setMessage(error instanceof Error?error.message:'Could not start the TV display.');}
  },[roomId]);
  useEffect(()=>{
    if(!enabled||!roomId){setState('disabled');return;}
    const ua=navigator.userAgent;const supported=/Chrome\//.test(ua)&&!/(CriOS|Edg\/|OPR\/)/.test(ua)&&!/(iPhone|iPad|iPod)/.test(ua);
    if(!supported){setState('disabled');setMessage('Google Cast launching requires Chrome on Android or desktop.');return;}
    if(!appId||appId.startsWith('replace-')){setState('disabled');setMessage('Cast receiver registration is not configured.');return;}
    let disposed=false;let context:CastContext|undefined;let handler:((event:{sessionState:string})=>void)|undefined;
    const initialize=()=>{if(disposed||!window.cast||!window.chrome)return;context=window.cast.framework.CastContext.getInstance();contextRef.current=context;context.setOptions({receiverApplicationId:appId,autoJoinPolicy:window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,resumeSavedSession:true});const states=window.cast.framework.SessionState;handler=(event)=>{const session=context?.getCurrentSession();if((event.sessionState===states.SESSION_STARTED||event.sessionState===states.SESSION_RESUMED)&&session)void sendLaunch(session,event.sessionState===states.SESSION_STARTED);if(event.sessionState===states.SESSION_STARTING)setState('connecting');if(event.sessionState===states.SESSION_ENDED){const displayId=activeRef.current?.id;if(displayId)void api(`/api/displays/${displayId}`,{method:'DELETE',body:'{}'}).catch(()=>undefined);setState('ready');}};context.addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,handler);const current=context.getCurrentSession();setState(current?'connected':'ready');if(current)void sendLaunch(current);};
    setState('loading');window.__onGCastApiAvailable=(available)=>{if(available)initialize();else{setState('error');setMessage('The Google Cast SDK is unavailable.');}};
    if(window.cast)initialize();else if(!document.getElementById('google-cast-sender-sdk')){const script=document.createElement('script');script.id='google-cast-sender-sdk';script.src='https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';script.async=true;script.onerror=()=>{setState('error');setMessage('The Google Cast SDK could not be loaded.');};document.head.appendChild(script);}
    return()=>{disposed=true;if(context&&handler&&window.cast)context.removeEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,handler);};
  },[appId,enabled,roomId,sendLaunch]);
  const requestSession=useCallback(async()=>{try{await contextRef.current?.requestSession();}catch{setState('ready');}},[]);
  const disconnect=useCallback(async()=>{try{if(activeRef.current?.id)await api(`/api/displays/${activeRef.current.id}`,{method:'DELETE',body:'{}'});}finally{contextRef.current?.endCurrentSession(true);setState('ready');}},[]);
  const launcher=state==='ready'||state==='connected'||state==='connecting'?createElement('google-cast-launcher',{className:'cast-launcher','aria-label':'Cast Watch Bracket to a TV'}):null;
  return{state,deviceName,message,launcher,requestSession,disconnect};
}
