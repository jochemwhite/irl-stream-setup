'use client';

import { useLiveWs } from "@/hooks/use-live-ws";
import type { RtmpReader, ObsStatusMessage, SceneSwitchEntry } from "@/hooks/use-live-ws";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { WebRTCPlayer } from "@/components/webrtc-player";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Gauge, Clock, AlertTriangle, Heart, Users, MonitorX,
  ArrowDownUp, Network, Radio, Layers, Wifi, WifiOff,
  ArrowDownToLine, ArrowUpFromLine, Clapperboard, Play,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";

interface HistoryPoint {
  time: string;
  bitrate: number;
  receiveRate: number;
  rtt: number;
  loss: number;
  linkCapacity: number;
  retrans: number;
  nakSent: number;
  flightSize: number;
  receiveBuf: number;
  dropped: number;
  health: number;
  outBitrate: number;
  outDropped: number;
}

function calcHealth(bitrate: number, loss: number, rtt: number) {
  let score = 100;
  if (bitrate < 2) score -= 30;
  if (bitrate < 1) score -= 30;
  if (loss > 1) score -= 20;
  if (loss > 5) score -= 30;
  if (rtt > 100) score -= 10;
  if (rtt > 250) score -= 20;
  return Math.max(0, score);
}

function healthLabel(score: number): { label: string; status: "good" | "warn" | "bad" } {
  if (score >= 80) return { label: `${score} — Good`, status: "good" };
  if (score >= 50) return { label: `${score} — Fair`, status: "warn" };
  return { label: `${score} — Poor`, status: "bad" };
}

function statusFor(v: number | null, good: number, warn: number, higher: boolean): "good" | "warn" | "bad" | "neutral" {
  if (v === null) return "neutral";
  if (higher) return v >= good ? "good" : v >= warn ? "warn" : "bad";
  return v <= good ? "good" : v <= warn ? "warn" : "bad";
}

function formatDuration(start: string): string {
  const diff = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const tooltipStyle = {
  background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)",
  borderRadius: "8px", fontSize: "11px", padding: "8px 12px",
};

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card/50 border-border/40">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{title}</CardTitle>
        {description && <p className="text-[10px] text-muted-foreground/60 leading-snug mt-0.5">{description}</p>}
      </CardHeader>
      <CardContent className="px-1 pb-2">{children}</CardContent>
    </Card>
  );
}

function AreaChartBlock({ data, dataKey, color, gid, domain }: { data: HistoryPoint[]; dataKey: string; color: string; gid: string; domain?: [number, number] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 18%)" />
        <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" width={45} domain={domain} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gid})`} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function LineChartBlock({ data, dataKey, color }: { data: HistoryPoint[]; dataKey: string; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 18%)" />
        <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" width={45} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const MAX_HISTORY = 120;

const REASON_LABELS: Record<SceneSwitchEntry["reason"], { label: string; className: string }> = {
  auto_fallback: { label: "Fallback", className: "text-red-400 border-red-500/30" },
  auto_recover:  { label: "Recover",  className: "text-emerald-400 border-emerald-500/30" },
  override:      { label: "Override", className: "text-amber-400 border-amber-500/30" },
  manual:        { label: "Manual",   className: "text-sky-400 border-sky-500/30" },
};

const LOG_PREVIEW = 5;

function SceneSwitchLog({ switchLog, wsConnected }: { switchLog: SceneSwitchEntry[]; wsConnected: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? switchLog : switchLog.slice(0, LOG_PREVIEW);
  const hasMore = switchLog.length > LOG_PREVIEW;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Scene switch log</p>
        {wsConnected && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-500/70">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>
      {switchLog.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic">No scene switches recorded yet.</p>
      ) : (
        <>
          <div className="rounded-md border border-border/40 divide-y divide-border/30 overflow-hidden">
            {visible.map((entry) => {
              const badge = REASON_LABELS[entry.reason];
              const time = new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              return (
                <div key={entry.ts} className="flex items-start gap-2 px-3 py-2 text-xs hover:bg-accent/10">
                  <span className="text-muted-foreground/60 font-mono shrink-0 pt-px">{time}</span>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${badge.className}`}>{badge.label}</Badge>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{entry.to}</span>
                    {entry.from && <span className="text-muted-foreground"> ← {entry.from}</span>}
                    <p className="text-[10px] text-muted-foreground/70 truncate">{entry.detail}</p>
                  </div>
                  {entry.path && <span className="text-[10px] text-muted-foreground/50 shrink-0 font-mono">{entry.path}</span>}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="w-full text-[10px] text-muted-foreground/60 hover:text-muted-foreground py-1 transition-colors"
            >
              {expanded ? "Show less" : `Show ${switchLog.length - LOG_PREVIEW} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ObsPanel({ obsStatus, wsSwitchLog, wsConnected }: { obsStatus: ObsStatusMessage | null; wsSwitchLog: SceneSwitchEntry[]; wsConnected: boolean }) {
  const [scenes, setScenes] = useState<{ sceneName: string; sceneIndex: number }[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [apiLog, setApiLog] = useState<SceneSwitchEntry[]>([]);

  useEffect(() => {
    if (!obsStatus?.connected) { setScenes([]); return; }
    fetch("/api/obs/scenes").then((r) => r.json()).then(setScenes).catch(() => {});
  }, [obsStatus?.connected]);

  useEffect(() => {
    fetch("/api/obs/switch-log").then((r) => r.json()).then(setApiLog).catch(() => {});
  }, []);

  const switchLog = useMemo(() => {
    const seen = new Set<string>();
    return [...wsSwitchLog, ...apiLog].filter((e) => {
      if (seen.has(e.ts)) return false;
      seen.add(e.ts);
      return true;
    }).slice(0, 30);
  }, [wsSwitchLog, apiLog]);

  async function switchTo(sceneName: string) {
    setSwitching(sceneName);
    try {
      await fetch("/api/obs/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sceneName }) });
    } catch {}
    setSwitching(null);
  }

  const connected = obsStatus?.connected ?? false;

  return (
    <Card className="bg-card/50 border-border/40">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <span className="flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> OBS Control</span>
          {connected ? (
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 gap-1 text-[10px]">
              <Wifi className="h-2.5 w-2.5" /> Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground border-border gap-1 text-[10px]">
              <WifiOff className="h-2.5 w-2.5" /> Disconnected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {connected && obsStatus?.scene && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Current scene</span>
            <span className="text-sm font-medium">{obsStatus.scene}</span>
          </div>
        )}

        {connected && scenes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Quick switch</p>
            <div className="flex flex-wrap gap-2">
              {[...scenes].filter((s) => !s.sceneName.startsWith("_")).sort((a, b) => a.sceneIndex - b.sceneIndex).map((s) => {
                const active = s.sceneName === obsStatus?.scene;
                return (
                  <Button
                    key={s.sceneName}
                    size="sm"
                    variant={active ? "secondary" : "outline"}
                    className={`h-7 text-xs gap-1.5 ${active ? "border-emerald-500/30 text-emerald-400" : ""}`}
                    disabled={active || switching === s.sceneName}
                    onClick={() => switchTo(s.sceneName)}
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                    <Play className={`h-2.5 w-2.5 ${active ? "hidden" : ""}`} />
                    {s.sceneName}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <SceneSwitchLog switchLog={switchLog} wsConnected={wsConnected} />

        {!connected && (
          <p className="text-xs text-muted-foreground">Configure OBS WebSocket in <a href="/settings" className="underline underline-offset-2">Settings</a> to enable scene control.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function LivePage() {
  const { message, connected, obsStatus, sceneSwitchLog } = useLiveWs();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const lastTimeRef = useRef("");

  const isLive = message?.type === "snapshot";
  const snap = isLive ? message.snapshot : null;
  const session = isLive ? message.session : null;
  const pathSnap = isLive ? message.path_snapshot : null;
  const readers: RtmpReader[] = isLive ? message.rtmp_readers ?? [] : [];
  const obsCounters = isLive ? message.obs_counters : null;

  const whepUrl = useMemo(() => {
    if (!session?.path) return undefined;
    const base = process.env.NEXT_PUBLIC_MEDIAMTX_URL ??
      (typeof window !== "undefined" ? `http://${window.location.hostname}:8889` : undefined);
    return base ? `${base}/${session.path}/whep` : undefined;
  }, [session?.path]);

  useEffect(() => {
    if (!snap) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (now === lastTimeRef.current) return;
    lastTimeRef.current = now;

    const bitrate = Number(snap.bitrate_mbps) || 0;
    const rtt = Number(snap.ms_rtt) || 0;
    const loss = Number(snap.packets_received_loss_rate) || 0;
    const totalOutBitrate = readers.reduce((a, r) => a + r.bitrate_mbps, 0);
    const totalOutDropped = readers.reduce((a, r) => a + r.outbound_frames_discarded, 0);

    setHistory((prev) => [
      ...prev.slice(-(MAX_HISTORY - 1)),
      {
        time: now, bitrate, rtt, loss,
        receiveRate: Number(snap.mbps_receive_rate) || 0,
        linkCapacity: Number(snap.mbps_link_capacity) || 0,
        retrans: Number(snap.packets_retrans) || 0,
        nakSent: Number(snap.packets_sent_nak) || 0,
        flightSize: Number(snap.packets_flight_size) || 0,
        receiveBuf: Number(snap.ms_receive_buf) || 0,
        dropped: Number(snap.outbound_frames_discarded) || 0,
        health: calcHealth(bitrate, loss, rtt),
        outBitrate: totalOutBitrate,
        outDropped: totalOutDropped,
      },
    ]);
  }, [snap, readers]);

  const healthScore = snap ? calcHealth(Number(snap.bitrate_mbps) || 0, Number(snap.packets_received_loss_rate) || 0, Number(snap.ms_rtt) || 0) : null;
  const health = healthScore !== null ? healthLabel(healthScore) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Live Monitor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLive ? `${session?.path} · ${snap?.remote_addr ?? ""} · up ${formatDuration(session?.started_at ?? "")}` : "No active stream"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] gap-1 ${connected ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground border-border"}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "WS" : "Disconnected"}
          </Badge>
          <StatusBadge live={isLive} />
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="bg-card border border-border/40">
          <TabsTrigger value="all" className="gap-1.5 text-xs">Overview</TabsTrigger>
          <TabsTrigger value="incoming" className="gap-1.5 text-xs">
            <ArrowDownToLine className="h-3 w-3" /> Incoming
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-1.5 text-xs">
            <ArrowUpFromLine className="h-3 w-3" /> Outgoing
            {readers.length > 0 && <span className="text-[10px] text-muted-foreground">({readers.length})</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <WebRTCPlayer whepUrl={whepUrl} />
            </div>
            <div className="lg:col-span-2 grid grid-cols-2 gap-2 content-start">
              <MetricCard label="Health" value={health?.label ?? "—"} icon={<Heart className="h-4 w-4" />} status={health?.status ?? "neutral"} />
              <MetricCard label="Bitrate In" value={snap ? Number(snap.bitrate_mbps).toFixed(2) : "—"} unit="Mbps" icon={<ArrowDownToLine className="h-4 w-4" />} status={statusFor(snap ? Number(snap.bitrate_mbps) : null, 4, 2, true)} counter={obsCounters?.bitrate} />
              <MetricCard label="RTT" value={snap ? Number(snap.ms_rtt).toFixed(0) : "—"} unit="ms" icon={<Clock className="h-4 w-4" />} status={statusFor(snap ? Number(snap.ms_rtt) : null, 100, 250, false)} counter={obsCounters?.rtt} />
              <MetricCard label="Loss" value={snap ? Number(snap.packets_received_loss_rate).toFixed(2) : "—"} unit="%" icon={<AlertTriangle className="h-4 w-4" />} status={statusFor(snap ? Number(snap.packets_received_loss_rate) : null, 1, 5, false)} counter={obsCounters?.loss} />
              <MetricCard label="Readers" value={pathSnap?.readers ?? 0} icon={<Users className="h-4 w-4" />} />
              <MetricCard label="Out Bitrate" value={readers.length > 0 ? readers.reduce((a, r) => a + r.bitrate_mbps, 0).toFixed(2) : "—"} unit="Mbps" icon={<ArrowUpFromLine className="h-4 w-4" />} />
            </div>
          </div>

          <ObsPanel obsStatus={obsStatus} wsSwitchLog={sceneSwitchLog} wsConnected={connected} />

          {history.length > 1 && (
            <>
              <ChartCard title="Health Score" description="Composite 0–100 based on bitrate, loss, and RTT.">
                <AreaChartBlock data={history} dataKey="health" color="#34d399" gid="a-health" domain={[0, 100]} />
              </ChartCard>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Inbound Bitrate (Mbps)" description="SRT data rate arriving at the server.">
                  <AreaChartBlock data={history} dataKey="bitrate" color="#34d399" gid="a-ibit" />
                </ChartCard>
                <ChartCard title="Outbound Bitrate (Mbps)" description="Total RTMP data rate going to all readers.">
                  <AreaChartBlock data={history} dataKey="outBitrate" color="#60a5fa" gid="a-obit" />
                </ChartCard>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="incoming" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <MetricCard label="Health" value={health?.label ?? "—"} icon={<Heart className="h-4 w-4" />} status={health?.status ?? "neutral"} />
            <MetricCard label="Bitrate" value={snap ? Number(snap.bitrate_mbps).toFixed(2) : "—"} unit="Mbps" icon={<Gauge className="h-4 w-4" />} status={statusFor(snap ? Number(snap.bitrate_mbps) : null, 4, 2, true)} />
            <MetricCard label="RTT" value={snap ? Number(snap.ms_rtt).toFixed(0) : "—"} unit="ms" icon={<Clock className="h-4 w-4" />} status={statusFor(snap ? Number(snap.ms_rtt) : null, 100, 250, false)} />
            <MetricCard label="Packet Loss" value={snap ? Number(snap.packets_received_loss_rate).toFixed(2) : "—"} unit="%" icon={<AlertTriangle className="h-4 w-4" />} status={statusFor(snap ? Number(snap.packets_received_loss_rate) : null, 1, 5, false)} />
            <MetricCard label="Readers" value={pathSnap?.readers ?? 0} icon={<Users className="h-4 w-4" />} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <MetricCard label="Receive Rate" value={snap ? Number(snap.mbps_receive_rate).toFixed(2) : "—"} unit="Mbps" icon={<ArrowDownUp className="h-4 w-4" />} />
            <MetricCard label="Link Capacity" value={snap ? Number(snap.mbps_link_capacity).toFixed(0) : "—"} unit="Mbps" icon={<Radio className="h-4 w-4" />} />
            <MetricCard label="Retransmits" value={snap ? Number(snap.packets_retrans) : 0} icon={<Network className="h-4 w-4" />} />
            <MetricCard label="Dropped" value={snap ? Number(snap.outbound_frames_discarded) : 0} icon={<MonitorX className="h-4 w-4" />} />
            <MetricCard label="Recv Buffer" value={snap ? Number(snap.ms_receive_buf).toFixed(0) : "—"} unit="ms" icon={<Layers className="h-4 w-4" />} />
          </div>

          {snap && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { label: "NAKs Sent", value: String(snap.packets_sent_nak) },
                { label: "Flight Size", value: `${snap.packets_flight_size} pkts` },
                { label: "Flow Window", value: `${snap.packets_flow_window} pkts` },
                { label: "Total Received", value: formatBytes(Number(snap.bytes_received)) },
                { label: "Total Loss", value: formatBytes(Number(snap.bytes_received_loss)) },
                { label: "TSB PD Delay", value: `${snap.ms_receive_tsb_pd_delay} ms` },
              ].map((s) => (
                <Card key={s.label} className="bg-card/50 border-border/40">
                  <CardContent className="pt-2.5 pb-2 px-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">{s.label}</div>
                    <div className="text-xs font-semibold tabular-nums">{s.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {history.length > 1 && (
            <>
              <ChartCard title="Health Score" description="Composite 0–100 based on bitrate, loss, and RTT.">
                <AreaChartBlock data={history} dataKey="health" color="#34d399" gid="i-health" domain={[0, 100]} />
              </ChartCard>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Calculated Bitrate (Mbps)" description="Actual data throughput derived from bytes received between polls.">
                  <AreaChartBlock data={history} dataKey="bitrate" color="#34d399" gid="i-bit" />
                </ChartCard>
                <ChartCard title="SRT Receive Rate (Mbps)" description="SRT's internal receive rate including protocol overhead.">
                  <AreaChartBlock data={history} dataKey="receiveRate" color="#60a5fa" gid="i-recv" />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="RTT (ms)" description="Round-trip time. High RTT increases latency and buffer requirements.">
                  <AreaChartBlock data={history} dataKey="rtt" color="#fbbf24" gid="i-rtt" />
                </ChartCard>
                <ChartCard title="Link Capacity (Mbps)" description="Estimated bandwidth of the network path.">
                  <AreaChartBlock data={history} dataKey="linkCapacity" color="#818cf8" gid="i-lc" />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Recv Loss Rate (%)" description="Packet loss percentage. Even >1% can cause visible artifacts.">
                  <LineChartBlock data={history} dataKey="loss" color="#f87171" />
                </ChartCard>
                <ChartCard title="Retransmits (cumulative)" description="Packets re-sent after loss.">
                  <LineChartBlock data={history} dataKey="retrans" color="#a78bfa" />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Receive Buffer (ms)" description="Data buffered on the receiver. 0 means buffer underrun.">
                  <AreaChartBlock data={history} dataKey="receiveBuf" color="#2dd4bf" gid="i-rbuf" />
                </ChartCard>
                <ChartCard title="Flight Size (packets)" description="Packets in-flight. Should stay below flow window.">
                  <LineChartBlock data={history} dataKey="flightSize" color="#f472b6" />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Frames Dropped (outbound)" description="Video frames MediaMTX couldn't forward in time.">
                  <LineChartBlock data={history} dataKey="dropped" color="#ef4444" />
                </ChartCard>
                <ChartCard title="NAKs Sent (cumulative)" description="Loss reports requesting retransmission.">
                  <LineChartBlock data={history} dataKey="nakSent" color="#e879f9" />
                </ChartCard>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4 space-y-4">
          {readers.length === 0 ? (
            <Card className="bg-card/50 border-border/40">
              <CardContent className="flex items-center justify-center py-16">
                <div className="text-center">
                  <ArrowUpFromLine className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No RTMP readers connected</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Connect OBS to rtmp://server/live/path to see outgoing stats</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="RTMP Readers" value={readers.length} icon={<Users className="h-4 w-4" />} />
                <MetricCard label="Total Out Bitrate" value={readers.reduce((a, r) => a + r.bitrate_mbps, 0).toFixed(2)} unit="Mbps" icon={<ArrowUpFromLine className="h-4 w-4" />} />
                <MetricCard label="Total Bytes Sent" value={formatBytes(readers.reduce((a, r) => a + r.bytes_sent, 0))} icon={<Gauge className="h-4 w-4" />} />
                <MetricCard label="Total Dropped" value={readers.reduce((a, r) => a + r.outbound_frames_discarded, 0)} icon={<MonitorX className="h-4 w-4" />} status={readers.reduce((a, r) => a + r.outbound_frames_discarded, 0) > 0 ? "warn" : "good"} />
              </div>

              <Card className="bg-card/50 border-border/40">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">RTMP Connections</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/30 hover:bg-transparent">
                        <TableHead className="text-[10px] pl-4">Remote Addr</TableHead>
                        <TableHead className="text-[10px]">Bitrate</TableHead>
                        <TableHead className="text-[10px]">Bytes Sent</TableHead>
                        <TableHead className="text-[10px]">Outbound Bytes</TableHead>
                        <TableHead className="text-[10px]">Dropped Frames</TableHead>
                        <TableHead className="text-[10px] pr-4">Conn ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {readers.map((r) => (
                        <TableRow key={r.id} className="border-border/20 hover:bg-accent/20 font-mono text-[11px]">
                          <TableCell className="pl-4">{r.remote_addr || "—"}</TableCell>
                          <TableCell>{r.bitrate_mbps.toFixed(2)} Mbps</TableCell>
                          <TableCell>{formatBytes(r.bytes_sent)}</TableCell>
                          <TableCell>{formatBytes(r.outbound_bytes)}</TableCell>
                          <TableCell><span className={r.outbound_frames_discarded > 0 ? "text-amber-400" : ""}>{r.outbound_frames_discarded}</span></TableCell>
                          <TableCell className="pr-4 text-muted-foreground truncate max-w-[120px]">{r.id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {history.length > 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ChartCard title="Outbound Bitrate (Mbps)" description="Total RTMP data rate across all readers.">
                    <AreaChartBlock data={history} dataKey="outBitrate" color="#60a5fa" gid="o-bit" />
                  </ChartCard>
                  <ChartCard title="Outbound Dropped Frames" description="Frames dropped before sending to RTMP readers.">
                    <LineChartBlock data={history} dataKey="outDropped" color="#ef4444" />
                  </ChartCard>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
