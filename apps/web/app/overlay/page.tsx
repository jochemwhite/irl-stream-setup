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

// ── Metric row ────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  bad,
  good,
  fallbackThreshold,
  recoverThreshold,
  inFallback,
}: {
  label: string;
  bad: number;
  good: number;
  fallbackThreshold: number;
  recoverThreshold: number;
  inFallback: boolean;
}) {
  const active = inFallback ? good > 0 : bad > 0;
  if (!active) return null;

  if (inFallback) {
    // Recovery mode — show good poll progress
    const pct = Math.min((good / recoverThreshold) * 100, 100);
    const color = pct >= 80 ? "bg-emerald-400" : pct >= 40 ? "bg-emerald-500/70" : "bg-emerald-600/50";
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-white/50 w-16 shrink-0">{label}</span>
        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono tabular-nums text-emerald-400 shrink-0 w-12 text-right">
          {good}/{recoverThreshold} good
        </span>
      </div>
    );
  }

  // Fallback mode — show bad poll progress
  const pct = Math.min((bad / fallbackThreshold) * 100, 100);
  const isCritical = pct >= 90;
  const isClose = pct >= 60;
  const barColor = isCritical ? "bg-red-400" : isClose ? "bg-amber-400" : "bg-yellow-400/70";
  const textColor = isCritical ? "text-red-400" : isClose ? "text-amber-400" : "text-yellow-400/80";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-mono text-white/50 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono tabular-nums shrink-0 w-12 text-right ${textColor}`}>
        {bad}/{fallbackThreshold} bad
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

  const hasRecovery =
    inFallback &&
    counters !== null &&
    (counters.bitrate.good > 0 || counters.rtt.good > 0 || counters.loss.good > 0);

  const showBars = hasWarning || hasRecovery;

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

  const dotPulse = inFallback || hasWarning;

  if (!wsConnected) {
    return (
      <div className="fixed top-4 inset-x-0 flex justify-center">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/8">
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="text-sm text-white/30 font-mono">connecting…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-32 inset-x-0 flex justify-center select-none">
      <div
        className={[
          "rounded-2xl px-5 py-4 backdrop-blur-sm border transition-all duration-500 bg-black/75",
          cardBorder,
        ].join(" ")}
        style={{ minWidth: 280, maxWidth: 420 }}
      >
        {/* Scene name row */}
        <div className="flex items-center justify-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {dotPulse && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor}`} />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColor}`} />
          </span>

          <span className="text-base font-semibold text-white/90 leading-tight text-center">
            {scene ?? (obsConnected ? "Unknown scene" : "OBS offline")}
          </span>

          {inFallback && (
            <span className="shrink-0 text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-md bg-orange-500/25 text-orange-300 border border-orange-500/30">
              FALLBACK
            </span>
          )}
        </div>

        {/* Poll bars */}
        {showBars && counters && (
          <div className="mt-3 flex flex-col gap-2">
            <MetricRow
              label="bitrate"
              bad={counters.bitrate.bad}
              good={counters.bitrate.good}
              fallbackThreshold={counters.bitrate.fallbackThreshold}
              recoverThreshold={counters.bitrate.recoverThreshold}
              inFallback={inFallback}
            />
            <MetricRow
              label="rtt"
              bad={counters.rtt.bad}
              good={counters.rtt.good}
              fallbackThreshold={counters.rtt.fallbackThreshold}
              recoverThreshold={counters.rtt.recoverThreshold}
              inFallback={inFallback}
            />
            <MetricRow
              label="loss"
              bad={counters.loss.bad}
              good={counters.loss.good}
              fallbackThreshold={counters.loss.fallbackThreshold}
              recoverThreshold={counters.loss.recoverThreshold}
              inFallback={inFallback}
            />
          </div>
        )}

        {/* Fallback / offline notices */}
        {inFallback && !hasRecovery && (
          <p className="mt-2 text-xs text-orange-300/60 leading-tight text-center">
            Waiting for recovery
          </p>
        )}
        {!isLive && obsConnected && (
          <p className="mt-2 text-xs text-white/25 text-center">No stream</p>
        )}
      </div>
    </div>
  );
}
