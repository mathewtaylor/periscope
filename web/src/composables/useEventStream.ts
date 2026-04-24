import { ref } from "vue";
import type { WsMessage } from "@/lib/types";

type Listener = (msg: WsMessage) => void;

const listeners = new Set<Listener>();
const connected = ref(false);
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 250;
const MAX_BACKOFF = 15_000;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, backoff);
  backoff = Math.min(backoff * 2, MAX_BACKOFF);
}

function connect(): void {
  try {
    socket = new WebSocket(wsUrl());
  } catch (err) {
    console.error("[ws] open threw", err);
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    connected.value = true;
    backoff = 250;
  });
  socket.addEventListener("close", () => {
    connected.value = false;
    socket = null;
    scheduleReconnect();
  });
  socket.addEventListener("error", () => {
    // close fires right after — handled there
  });
  socket.addEventListener("message", (ev) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(ev.data as string) as WsMessage;
    } catch {
      return;
    }
    for (const l of listeners) {
      try {
        l(msg);
      } catch (err) {
        console.error("[ws] listener threw", err);
      }
    }
  });
}

let started = false;
export function ensureEventStream(): void {
  if (started) return;
  started = true;
  connect();
}

export function onMessage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEventStream() {
  ensureEventStream();
  return { connected, onMessage };
}
