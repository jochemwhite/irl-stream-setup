'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldAlert, X, Clapperboard, Bookmark, Dices, Tv2,
  MonitorPlay, Coffee, Gamepad2, Mic, Film, CircleOff,
  Users, Tv, Radio, ArrowLeft, Wifi, WifiOff,
  Toilet, Square, Circle, RefreshCw,
} from "lucide-react";
import {
  useLiveWs,
  type SceneSwitchEntry,
} from "@/hooks/use-live-ws";
import { createClip } from "@/actions/clip";
import { createMarker } from "@/actions/marker";
import { spinWheel } from "@/actions/wheel";
import { startAdBreak } from "@/actions/ad-break";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";

// ── icon heuristic ────────────────────────────────────────────────────────────
function sceneIcon(name: string) {
  const l = name.toLowerCase();
  if (l.includes("brb") || l.includes("break") || l.includes("pause")) return Toilet;
  if (l.includes("game") || l.includes("gaming"))                        return Gamepad2;
  if (l.includes("cam") || l.includes("face") || l.includes("face cam")) return Users;
  if (l.includes("outro") || l.includes("end"))                          return CircleOff;
  if (l.includes("intro") || l.includes("start"))                        return Film;
  if (l.includes("irl") || l.includes("mic") || l.includes("talk"))      return Mic;
  if (l.includes("live") || l.includes("main") || l.includes("primary")) return Radio;
  if (l.includes("screen") || l.includes("desktop"))                      return Tv;
  return MonitorPlay;
}

// ── reason styles ─────────────────────────────────────────────────────────────
const reasonStyle: Record<SceneSwitchEntry["reason"], { label: string; color: string }> = {
  auto_fallback: { label: "FALLBACK", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  auto_recover:  { label: "RECOVER",  color: "bg-green-500/20 text-green-400 border-green-500/30" },
  override:      { label: "OVERRIDE", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  manual:        { label: "MANUAL",   color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface ObsScene { sceneName: string; sceneIndex: number }

const DRAG_THRESHOLD = 30;

export default function DeckPage() {
  const { message, obsStatus, obsStreamStatus, sceneSwitchLog } = useLiveWs();
  const [scenes, setScenes]       = useState<ObsScene[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [logOpen, setLogOpen]         = useState(false);
  const [actionBusy, setActionBusy]   = useState<string | null>(null);
  const [overridePath, setOverridePath]   = useState<string | null>(null);
  const [overrideScene, setOverrideScene] = useState<string | null>(null);
  const dragStartY                        = useRef<number | null>(null);

  const isLive      = message?.type === "snapshot";
  const bitrate     = isLive ? (message.snapshot.bitrate_mbps as number ?? 0) : 0;
  const inFallback  = message?.type === "snapshot" ? message.obs_counters?.inFallback ?? false : false;
  const activeScene    = obsStatus?.scene ?? null;
  const obsConn        = obsStatus?.connected ?? false;
  const isStreaming    = obsStreamStatus?.streaming ?? false;
  const streamStarted  = obsStreamStatus?.startedAt ?? null;

  const [streamUptime, setStreamUptime] = useState("00:00:00");
  const [streamBusy, setStreamBusy]     = useState(false);

  useEffect(() => {
    if (!streamStarted) { setStreamUptime("00:00:00"); return; }
    function tick() {
      const elapsed = Math.floor((Date.now() - new Date(streamStarted!).getTime()) / 1000);
      const h = Math.floor(elapsed / 3600).toString().padStart(2, "0");
      const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0");
      const s = (elapsed % 60).toString().padStart(2, "0");
      setStreamUptime(`${h}:${m}:${s}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [streamStarted]);

  const fetchScenes = useCallback(async () => {
    try {
      const res = await fetch("/api/obs/scenes");
      if (!res.ok) return;
      const data: ObsScene[] = await res.json();
      setScenes(
        data
          .filter((s) => /[a-zA-Z0-9]/.test(s.sceneName) && !s.sceneName.startsWith("_"))
          .sort((a, b) => b.sceneIndex - a.sceneIndex)
      );
    } catch {}
  }, []);

  useEffect(() => { fetchScenes(); }, [fetchScenes]);
  useEffect(() => { if (obsConn) fetchScenes(); }, [obsConn, fetchScenes]);

  const fetchOverride = useCallback(async () => {
    try {
      const res = await fetch("/api/obs/config");
      if (!res.ok) return;
      const { paths } = await res.json();
      const active = (paths as { path: string; override_active: boolean; override_scene: string | null }[])
        ?.find((p) => p.override_active);
      setOverridePath(active?.path ?? null);
      setOverrideScene(active?.override_scene ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    fetchOverride();
    const id = setInterval(fetchOverride, 5000);
    return () => clearInterval(id);
  }, [fetchOverride]);

  async function switchScene(name: string) {
    if (!obsConn || switching) return;
    setSwitching(name);
    try {
      await fetch("/api/obs/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sceneName: name }),
      });
      const streamPath = message?.type === "snapshot" ? message.session.path : null;
      if (streamPath) {
        await fetch("/api/obs/override", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: streamPath, scene: name }),
        });
        setOverridePath(streamPath);
        setOverrideScene(name);
      }
    } finally {
      setSwitching(null);
    }
  }

  async function clearOverride() {
    if (!overridePath) return;
    await fetch(`/api/obs/override/${encodeURIComponent(overridePath)}`, { method: "DELETE" });
    setOverridePath(null);
    setOverrideScene(null);
  }

  async function toggleStream() {
    if (!obsConn || streamBusy) return;
    setStreamBusy(true);
    try {
      await fetch(isStreaming ? "/api/obs/stream/stop" : "/api/obs/stream/start", { method: "POST" });
    } finally {
      setStreamBusy(false);
    }
  }

  async function runAction(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (actionBusy) return;
    setActionBusy(key);
    try { await fn(); } finally { setActionBusy(null); }
  }

  function onHandlePointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    if (dragStartY.current === null) return;
    if (dragStartY.current - e.clientY > DRAG_THRESHOLD) {
      dragStartY.current = null;
      setLogOpen(true);
    }
  }

  function onHandlePointerUp() {
    dragStartY.current = null;
  }

  return (
    <>
      <div
        className="flex-1 flex flex-col min-h-0 w-full select-none"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        {/* ── status bar ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#111111]">
          <div className="flex items-center gap-3">
            {isLive ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                <span className="text-sm font-bold tracking-widest text-red-400">LIVE</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="text-sm font-bold tracking-widest text-white/30">OFFLINE</span>
              </div>
            )}
            {isLive && (
              <span className="text-sm font-mono text-white/60">
                {bitrate.toFixed(1)} <span className="text-white/30">Mb/s</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {inFallback && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-medium">
                FALLBACK
              </span>
            )}
            {obsConn
              ? <Wifi className="h-4 w-4 text-white/40" />
              : <WifiOff className="h-4 w-4 text-red-400/60" />}
          </div>
        </div>

        {/* ── override banner ─────────────────────────────────────────────── */}
        {overridePath && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-300 font-medium">Manual override</span>
              {overrideScene && (
                <span className="text-xs text-amber-400/60 truncate">· {overrideScene}</span>
              )}
            </div>
            <button
              onClick={clearOverride}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-200 transition-colors ml-3 shrink-0"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}

        {/* ── stream control ──────────────────────────────────────────────────── */}
        {obsConn && (
          <div className="px-3 pt-3 pb-1">
            <button
              onClick={toggleStream}
              disabled={streamBusy || !obsConn}
              className={[
                "w-full rounded-2xl flex items-center justify-between px-5 py-4",
                "border transition-all duration-150 active:scale-[0.98] disabled:opacity-50",
                isStreaming
                  ? "bg-red-500/15 border-red-500/30 hover:bg-red-500/20"
                  : "bg-white/5 border-white/10 hover:bg-white/8",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                {streamBusy ? (
                  <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                ) : isStreaming ? (
                  <Square className="h-5 w-5 text-red-400 fill-red-400" />
                ) : (
                  <Circle className="h-5 w-5 text-white/40" />
                )}
                <span className={["text-sm font-semibold", isStreaming ? "text-red-300" : "text-white/40"].join(" ")}>
                  {streamBusy ? (isStreaming ? "Stopping…" : "Starting…") : isStreaming ? "Stop stream" : "Start stream"}
                </span>
              </div>
              {isStreaming && streamStarted && (
                <span className="text-sm font-mono text-red-400/70 tabular-nums">{streamUptime}</span>
              )}
            </button>
          </div>
        )}

        {/* ── scene grid ──────────────────────────────────────────────────────── */}
        {/* pb-16 keeps bottom buttons above the peek strip */}
        <div className="flex-1 overflow-y-auto p-3 pb-16">
          {!obsConn && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <WifiOff className="h-10 w-10 text-white/15" />
              <p className="text-sm text-white/30">OBS not connected</p>
            </div>
          )}

          {obsConn && scenes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
              <p className="text-sm text-white/30">Loading scenes…</p>
            </div>
          )}

          {obsConn && scenes.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {scenes.map((scene) => {
                const isActive = scene.sceneName === activeScene;
                const isBusy   = switching === scene.sceneName;
                const Icon     = sceneIcon(scene.sceneName);

                return (
                  <button
                    key={scene.sceneName}
                    onClick={() => switchScene(scene.sceneName)}
                    disabled={!!switching}
                    className={[
                      "aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 p-4",
                      "border transition-all duration-150 active:scale-95 disabled:opacity-60",
                      isActive
                        ? "bg-white/10 border-white/25 ring-1 ring-white/20"
                        : "bg-[#1a1a1a] border-white/8 hover:bg-[#222]",
                      isBusy ? "opacity-70" : "",
                    ].join(" ")}
                    style={isActive ? {
                      boxShadow: "0 0 20px 2px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.1)"
                    } : {}}
                  >
                    {isBusy ? (
                      <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                    ) : (
                      <Icon
                        className={["h-8 w-8 transition-colors", isActive ? "text-white" : "text-white/40"].join(" ")}
                        strokeWidth={1.5}
                      />
                    )}
                    <span className={[
                      "text-sm font-medium text-center leading-tight line-clamp-2 transition-colors",
                      isActive ? "text-white" : "text-white/45",
                    ].join(" ")}>
                      {scene.sceneName}
                    </span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white/60" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── action buttons ──────────────────────────────────────────────── */}
          <div className="mt-3 mb-1">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="h-px flex-1 bg-white/8" />
              <span className="text-[10px] font-semibold tracking-widest text-white/20 uppercase">Actions</span>
              <div className="h-px flex-1 bg-white/8" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: "clip",        label: "Clip",       Icon: Clapperboard, fn: () => createClip() },
                { key: "marker",      label: "Marker",     Icon: Bookmark,     fn: () => createMarker() },
                { key: "wheel",       label: "Wheel",      Icon: Dices,        fn: () => spinWheel() },
                { key: "ad-break",    label: "Ad Break",   Icon: Tv2,          fn: () => startAdBreak() },
                {
                  key: "restart-cam",
                  label: "Restart Cam",
                  Icon: RefreshCw,
                  fn: async () => {
                    const res = await fetch("/api/obs/source/restart", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ inputName: "IRL CAM" }),
                    });
                    return { ok: res.ok };
                  },
                },
              ].map(({ key, label, Icon, fn }) => {
                const isBusy = actionBusy === key;
                return (
                  <button
                    key={key}
                    onClick={() => runAction(key, fn)}
                    disabled={!!actionBusy}
                    className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 p-2 border border-white/8 bg-[#1a1a1a] hover:bg-[#222] transition-all duration-150 active:scale-95 disabled:opacity-50"
                  >
                    {isBusy ? (
                      <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                    ) : (
                      <Icon className="h-5 w-5 text-white/40" strokeWidth={1.5} />
                    )}
                    <span className="text-[10px] font-medium text-white/35 text-center leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── peek strip — always visible, tap or drag up to open ─────────────── */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 bg-[#111111] border-t border-white/10 touch-none cursor-grab active:cursor-grabbing"
        onClick={() => setLogOpen(true)}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/25" />
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 pointer-events-none">
            <span className="text-sm font-medium text-white/40">Scene log</span>
            {sceneSwitchLog.length > 0 && (
              <span className="text-[10px] bg-white/10 text-white/35 rounded-full px-1.5 py-0.5 tabular-nums">
                {sceneSwitchLog.length}
              </span>
            )}
          </div>
          <a
            href="/"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/50 transition-colors pointer-events-auto"
          >
            <ArrowLeft className="h-3 w-3" />
            Dashboard
          </a>
        </div>
      </div>

      {/* ── scene log drawer ─────────────────────────────────────────────────── */}
      <Drawer open={logOpen} onOpenChange={setLogOpen}>
        <DrawerContent className="bg-[#111111] border-white/10 max-h-[75vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-sm text-white/60 font-medium tracking-wide">Scene log</DrawerTitle>
          </DrawerHeader>

          <div className="overflow-y-auto px-4 pb-8 flex flex-col gap-1.5">
            {sceneSwitchLog.length === 0 ? (
              <p className="text-xs text-white/25 text-center py-6">No switches yet</p>
            ) : (
              sceneSwitchLog.map((entry, i) => {
                const rs = reasonStyle[entry.reason];
                return (
                  <div
                    key={`${entry.ts}-${i}`}
                    className={[
                      "rounded-xl px-3 py-2.5 flex items-start gap-2.5",
                      i === 0 ? "bg-white/5 border border-white/8" : "bg-white/[0.02]",
                    ].join(" ")}
                  >
                    <span className="text-[10px] font-mono text-white/25 pt-0.5 shrink-0 tabular-nums">
                      {formatTime(entry.ts)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-white/40 truncate">{entry.from ?? "—"}</span>
                        <span className="text-white/20 text-xs">→</span>
                        <span className="text-xs text-white/80 font-medium truncate">{entry.to}</span>
                      </div>
                      {entry.detail && (
                        <p className="text-[10px] text-white/25 mt-0.5 truncate">{entry.detail}</p>
                      )}
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 tracking-wide ${rs.color}`}>
                      {rs.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
