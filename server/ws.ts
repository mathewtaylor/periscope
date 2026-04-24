import type { ServerWebSocket } from "bun";
import type { EventRow } from "./types.ts";
import { recentEvents } from "./db.ts";
import { computeStats } from "./derive/stats.ts";

export interface WsData {
  since?: string;
}

const sockets = new Set<ServerWebSocket<WsData>>();

export function registerSocket(ws: ServerWebSocket<WsData>): void {
  sockets.add(ws);
  send(ws, { type: "hello", server_ts: new Date().toISOString() });

  const since = ws.data?.since;
  if (since) {
    try {
      const replay = recentEvents({ since, limit: 500 });
      for (let i = replay.length - 1; i >= 0; i--) {
        send(ws, { type: "event", row: replay[i] });
      }
    } catch (err) {
      console.error("[ws] replay failed", err);
    }
  }

  try {
    send(ws, { type: "stats", ...computeStats() });
  } catch (err) {
    console.error("[ws] initial stats failed", err);
  }
}

export function unregisterSocket(ws: ServerWebSocket<WsData>): void {
  sockets.delete(ws);
}

export function broadcastEvent(row: EventRow): void {
  broadcast({ type: "event", row });
}

export function broadcastStats(): void {
  try {
    broadcast({ type: "stats", ...computeStats() });
  } catch (err) {
    console.error("[ws] stats broadcast failed", err);
  }
}

export function broadcastReset(): void {
  broadcast({ type: "reset" });
  broadcastStats();
}

function broadcast(message: unknown): void {
  if (sockets.size === 0) return;
  const data = JSON.stringify(message);
  for (const ws of sockets) {
    try {
      ws.send(data);
    } catch (err) {
      console.error("[ws] send failed", err);
    }
  }
}

function send(ws: ServerWebSocket<WsData>, message: unknown): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    console.error("[ws] send failed", err);
  }
}

export function socketCount(): number {
  return sockets.size;
}

let statsInterval: ReturnType<typeof setInterval> | null = null;

export function startStatsTicker(intervalMs = 5000): () => void {
  if (statsInterval) return () => stopStatsTicker();
  statsInterval = setInterval(() => broadcastStats(), intervalMs);
  return () => stopStatsTicker();
}

export function stopStatsTicker(): void {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}
