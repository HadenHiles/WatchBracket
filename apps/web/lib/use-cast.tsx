"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAST_NAMESPACE,
  CastLaunchEnvelopeSchema,
} from "@watch-bracket/display-protocol";
import { api } from "./api";

type CastSession = {
  sendMessage(namespace: string, data: unknown): Promise<unknown>;
  getCastDevice(): { friendlyName?: string };
};

type CastEvent = { sessionState?: string; castState?: string };
type CastContext = {
  setOptions(options: {
    receiverApplicationId: string;
    autoJoinPolicy: unknown;
    resumeSavedSession: boolean;
  }): void;
  addEventListener(type: string, handler: (event: CastEvent) => void): void;
  removeEventListener(type: string, handler: (event: CastEvent) => void): void;
  getCurrentSession(): CastSession | null;
  getCastState(): string;
  requestSession(): Promise<unknown>;
  endCurrentSession(stopCasting: boolean): void;
};

type CastGlobals = {
  cast: {
    framework: {
      CastContext: { getInstance(): CastContext };
      CastContextEventType: {
        CAST_STATE_CHANGED: string;
        SESSION_STATE_CHANGED: string;
      };
      CastState: Record<string, string>;
      SessionState: Record<string, string>;
    };
  };
  chrome: { cast: { AutoJoinPolicy: { ORIGIN_SCOPED: unknown } } };
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean, reason?: string) => void;
    cast?: CastGlobals["cast"];
    chrome?: CastGlobals["chrome"];
  }
}

export type CastUiState =
  | "disabled"
  | "loading"
  | "unavailable"
  | "ready"
  | "connecting"
  | "connected"
  | "error";

const castErrorMessage = (reason: unknown) => {
  if (!reason || typeof reason !== "object")
    return "Chrome could not open the Cast device picker.";
  const error = reason as { code?: unknown; description?: unknown };
  const code = typeof error.code === "string" ? error.code : undefined;
  const description =
    typeof error.description === "string" ? error.description : undefined;
  if (code === "cancel") return "";
  if (code === "receiver_unavailable")
    return "Chrome reports no compatible Cast receiver for Watch Bracket (RECEIVER_UNAVAILABLE).";
  if (code === "api_not_initialized")
    return "The Google Cast sender did not initialize (API_NOT_INITIALIZED). Reload Chrome and try again.";
  if (code === "extension_missing" || code === "extension_not_compatible")
    return `This Chrome installation cannot provide the Cast sender (${code.toUpperCase()}).`;
  return [description, code ? `(${code.toUpperCase()})` : undefined]
    .filter(Boolean)
    .join(" ") || "Chrome could not open the Cast device picker.";
};

export function useCast({
  enabled,
  roomId,
  activeDisplay,
}: {
  enabled: boolean;
  roomId: string;
  activeDisplay: { id: string; connected: boolean } | undefined;
}) {
  const [state, setState] = useState<CastUiState>("disabled");
  const [deviceName, setDeviceName] = useState("TV");
  const [message, setMessage] = useState("");
  const contextRef = useRef<CastContext | undefined>(undefined);
  const activeRef = useRef(activeDisplay);
  activeRef.current = activeDisplay;
  const appId = process.env.NEXT_PUBLIC_CAST_RECEIVER_APP_ID ?? "";

  const sendLaunch = useCallback(
    async (session: CastSession, force = false) => {
      if (!force && activeRef.current?.connected) {
        setState("connected");
        setDeviceName(session.getCastDevice().friendlyName ?? "TV");
        return;
      }
      setState("connecting");
      setDeviceName(session.getCastDevice().friendlyName ?? "TV");
      try {
        const issued = await api<{ launchToken: string; protocolVersion: 1 }>(
          `/api/rooms/${roomId}/cast-launch-tokens`,
          { method: "POST", body: "{}" },
        );
        const launch = CastLaunchEnvelopeSchema.parse({
          type: "WATCH_BRACKET_LAUNCH",
          schemaVersion: issued.protocolVersion,
          launchToken: issued.launchToken,
        });
        await session.sendMessage(CAST_NAMESPACE, launch);
        setState("connected");
        setMessage("");
      } catch (reason) {
        setState("error");
        setMessage(
          reason instanceof Error
            ? reason.message
            : "Could not start the TV display.",
        );
      }
    },
    [roomId],
  );

  useEffect(() => {
    if (!enabled || !roomId) {
      setState("disabled");
      return;
    }
    const userAgent = navigator.userAgent;
    const supported =
      /Chrome\//.test(userAgent) &&
      !/(CriOS|Edg\/|OPR\/)/.test(userAgent) &&
      !/(iPhone|iPad|iPod)/.test(userAgent);
    if (!supported) {
      setState("disabled");
      setMessage("Google Cast launching requires Chrome on Android or desktop.");
      return;
    }
    if (!appId || appId.startsWith("replace-")) {
      setState("disabled");
      setMessage("Cast receiver registration is not configured.");
      return;
    }

    let disposed = false;
    let context: CastContext | undefined;
    let castStateHandler: ((event: CastEvent) => void) | undefined;
    let sessionStateHandler: ((event: CastEvent) => void) | undefined;
    const sdkTimer = setTimeout(() => {
      if (!contextRef.current && !disposed) {
        setState("error");
        setMessage("The Google Cast SDK did not finish initializing.");
      }
    }, 10_000);

    const updateCastState = (castState: string) => {
      if (!window.cast || context?.getCurrentSession()) return;
      const states = window.cast.framework.CastState;
      if (castState === states.NO_DEVICES_AVAILABLE) {
        setState("unavailable");
        setMessage(
          `Chrome reports no compatible devices for Cast receiver ${appId}.`,
        );
      } else if (castState === states.CONNECTING) {
        setState("connecting");
        setMessage("");
      } else {
        setState("ready");
        setMessage("");
      }
    };

    const initialize = () => {
      if (disposed || !window.cast || !window.chrome) return;
      clearTimeout(sdkTimer);
      context = window.cast.framework.CastContext.getInstance();
      contextRef.current = context;
      context.setOptions({
        receiverApplicationId: appId,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        resumeSavedSession: true,
      });
      const sessionStates = window.cast.framework.SessionState;
      castStateHandler = (event) => {
        if (event.castState) updateCastState(event.castState);
      };
      sessionStateHandler = (event) => {
        const session = context?.getCurrentSession();
        if (
          (event.sessionState === sessionStates.SESSION_STARTED ||
            event.sessionState === sessionStates.SESSION_RESUMED) &&
          session
        )
          void sendLaunch(
            session,
            event.sessionState === sessionStates.SESSION_STARTED,
          );
        if (event.sessionState === sessionStates.SESSION_STARTING) {
          setState("connecting");
          setMessage("");
        }
        if (event.sessionState === sessionStates.SESSION_ENDED) {
          const displayId = activeRef.current?.id;
          if (displayId)
            void api(`/api/displays/${displayId}`, {
              method: "DELETE",
              body: "{}",
            }).catch(() => undefined);
          updateCastState(context?.getCastState() ?? "");
        }
      };
      context.addEventListener(
        window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
        castStateHandler,
      );
      context.addEventListener(
        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        sessionStateHandler,
      );
      const current = context.getCurrentSession();
      if (current) void sendLaunch(current);
      else updateCastState(context.getCastState());
    };

    setState("loading");
    setMessage("");
    window.__onGCastApiAvailable = (available, reason) => {
      if (available) initialize();
      else {
        clearTimeout(sdkTimer);
        setState("error");
        setMessage(
          reason
            ? `The Google Cast SDK is unavailable: ${reason}`
            : "The Google Cast SDK is unavailable in this browser.",
        );
      }
    };
    if (window.cast) initialize();
    else if (!document.getElementById("google-cast-sender-sdk")) {
      const script = document.createElement("script");
      script.id = "google-cast-sender-sdk";
      script.src =
        "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      script.async = true;
      script.onerror = () => {
        setState("error");
        setMessage("The Google Cast SDK could not be loaded.");
      };
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      clearTimeout(sdkTimer);
      if (context && castStateHandler && window.cast)
        context.removeEventListener(
          window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          castStateHandler,
        );
      if (context && sessionStateHandler && window.cast)
        context.removeEventListener(
          window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          sessionStateHandler,
        );
    };
  }, [appId, enabled, roomId, sendLaunch]);

  const requestSession = useCallback(async () => {
    const context = contextRef.current;
    if (!context) {
      setState("error");
      setMessage("The Google Cast sender is not initialized.");
      return;
    }
    try {
      await context.requestSession();
    } catch (reason) {
      const errorMessage = castErrorMessage(reason);
      setState(context.getCastState().includes("NO_DEVICES") ? "unavailable" : "ready");
      if (errorMessage) setMessage(errorMessage);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (activeRef.current?.id)
        await api(`/api/displays/${activeRef.current.id}`, {
          method: "DELETE",
          body: "{}",
        });
    } finally {
      contextRef.current?.endCurrentSession(true);
      setState("ready");
      setMessage("");
    }
  }, []);

  return { state, deviceName, message, requestSession, disconnect };
}
