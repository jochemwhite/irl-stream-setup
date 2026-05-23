'use client';

import { useState, useEffect, useRef } from "react";
import type { ObsCounters, SnapshotMessage } from "@/hooks/use-live-ws";

// ── Minimal WS hook that accepts a token from the URL search params ──────────

interface OverlayState {
  scene: string | null;
  inFallback: boolean;
  counters: ObsCounters | null;
  isLive: boolean;
  obsConnected: boolean;
  wsConnected: boolean;
}

function useOverlayWs(): OverlayState {
  const [state, setState] = useState<OverlayState>({
    scene: null,
    inFallback: false,
    counters: null,
    isLive: false,
    obsConnected: false,
    wsConnected: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function connect() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      const rawUrl =
        process.env.NEXT_PUBLIC_WS_URL ??
        `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
      const base = rawUrl.replace(/localhost|127\.0\.0\.1/, window.location.hostname);
      const wsUrl = token ? `${base}?token=${token}` : base;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setState((s) => ({ ...s, wsConnected: true }));

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "obs_status") {
            setState((s) => ({
              ...s,
              obsConnected: msg.connected,
              scene: msg.scene ?? s.scene,
            }));
          } else if (msg.type === "obs_scene_changed") {
            setState((s) => ({ ...s, scene: msg.scene }));
          } else if (msg.type === "snapshot") {
            const snap = msg as SnapshotMessage;
            setState((s) => ({
              ...s,
              isLive: true,
              inFallback: snap.obs_counters?.inFallback ?? false,
              counters: snap.obs_counters,
            }));
          } else if (msg.type === "offline") {
            setState((s) => ({ ...s, isLive: false, counters: null, inFallback: false }));
          }
        } catch {}
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, wsConnected: false }));
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return state;
}

// ── Metric warning bar ────────────────────────────────────────────────────────

function MetricBar({ label, bad, threshold }: { label: string; bad: number; threshold: number }) {
  if (bad === 0) return null;
  const pct = Math.min((bad / threshold) * 100, 100);
  const isClose = pct >= 60;
  const isCritical = pct >= 90;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-mono text-white/50 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={[
            "h-full rounded-full transition-all duration-300",
            isCritical ? "bg-red-400" : isClose ? "bg-amber-400" : "bg-yellow-400/70",
          ].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={[
        "text-[10px] font-mono tabular-nums shrink-0",
        isCritical ? "text-red-400" : isClose ? "text-amber-400" : "text-yellow-400/80",
      ].join(" ")}>
        {bad}/{threshold}
      </span>
    </div>
  );
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export default function OverlayPage() {
  const { scene, inFallback, counters, isLive, obsConnected, wsConnected } = useOverlayWs();

  const hasWarning =
    !inFallback &&
    counters !== null &&
    (counters.bitrate.bad > 0 || counters.rtt.bad > 0 || counters.loss.bad > 0);

  // Determine status colour for the dot / card border
  const statusColor = !obsConnected || !isLive
    ? "bg-white/20"
    : inFallback
    ? "bg-orange-400"
    : hasWarning
    ? "bg-yellow-400"
    : "bg-emerald-400";

  const cardBorder = inFallback
    ? "border-orange-500/40"
    : hasWarning
    ? "border-yellow-500/30"
    : "border-white/10";

  // Pulsing dot when warning / fallback
  const dotPulse = inFallback || hasWarning;

  if (!wsConnected) {
    return (
      <div className="fixed bottom-4 left-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-sm border border-white/8">
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span className="text-[11px] text-white/30 font-mono">connecting…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 select-none">
      <div
        className={[
          "rounded-2xl px-3 py-2.5 backdrop-blur-sm border transition-all duration-500",
          "bg-black/70",
          cardBorder,
        ].join(" ")}
        style={{ minWidth: 160, maxWidth: 260 }}
      >
        {/* Scene name row */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            {dotPulse && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor}`} />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor}`} />
          </span>

          <span className="text-[13px] font-semibold text-white/90 leading-tight truncate">
            {scene ?? (obsConnected ? "Unknown scene" : "OBS offline")}
          </span>

          {inFallback && (
            <span className="ml-auto shrink-0 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-md bg-orange-500/25 text-orange-300 border border-orange-500/30">
              FALLBACK
            </span>
          )}
        </div>

        {/* Warning bars — only shown when degrading */}
        {hasWarning && counters && (
          <div className="mt-2 flex flex-col gap-1">
            <MetricBar label="bitrate" bad={counters.bitrate.bad} threshold={counters.bitrate.threshold} />
            <MetricBar label="rtt" bad={counters.rtt.bad} threshold={counters.rtt.threshold} />
            <MetricBar label="loss" bad={counters.loss.bad} threshold={counters.loss.threshold} />
          </div>
        )}

        {/* Fallback detail row */}
        {inFallback && (
          <p className="mt-1.5 text-[10px] text-orange-300/60 leading-tight">
            Auto-switched — waiting for recovery
          </p>
        )}

        {/* Offline notice */}
        {!isLive && obsConnected && (
          <p className="mt-1 text-[10px] text-white/25">No stream</p>
        )}
      </div>
    </div>
  );
}
