'use client';

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

interface Session {
  id: number;
  path: string;
  srt_conn_id: string;
  started_at: string;
  ended_at: string | null;
  remote_addr: string | null;
  avg_bitrate_mbps: number | null;
  avg_rtt_ms: number | null;
  avg_packet_loss_pct: number | null;
  total_bytes_received: number | null;
  total_packets_lost: number | null;
  total_packets_retrans: number | null;
  total_frames_dropped: number | null;
  min_bitrate_mbps: number | null;
  max_bitrate_mbps: number | null;
}

interface Snapshot {
  id: number;
  recorded_at: string;
  srt_conn_id: string;
  remote_addr: string;
  bitrate_mbps: number;
  mbps_send_rate: number;
  mbps_receive_rate: number;
  mbps_link_capacity: number;
  mbps_max_bw: number;
  ms_rtt: number;
  us_packets_send_period: number;
  us_snd_duration: number;
  packets_sent: number;
  packets_received: number;
  packets_sent_unique: number;
  packets_received_unique: number;
  packets_send_loss: number;
  packets_received_loss: number;
  packets_retrans: number;
  packets_received_retrans: number;
  packets_send_drop: number;
  packets_received_drop: number;
  packets_received_belated: number;
  packets_received_undecrypt: number;
  packets_sent_ack: number;
  packets_received_ack: number;
  packets_sent_nak: number;
  packets_received_nak: number;
  packets_sent_km: number;
  packets_received_km: number;
  packets_send_loss_rate: number;
  packets_received_loss_rate: number;
  packets_reorder_tolerance: number;
  packets_received_avg_belated_time: number;
  packets_flow_window: number;
  packets_flight_size: number;
  outbound_frames_discarded: number;
  bytes_sent: number;
  bytes_received: number;
  bytes_sent_unique: number;
  bytes_received_unique: number;
  bytes_received_loss: number;
  bytes_retrans: number;
  bytes_received_retrans: number;
  bytes_received_belated: number;
  bytes_send_drop: number;
  bytes_received_drop: number;
  bytes_received_undecrypt: number;
  bytes_mss: number;
  packets_send_buf: number;
  bytes_send_buf: number;
  bytes_avail_send_buf: number;
  ms_send_buf: number;
  ms_send_tsb_pd_delay: number;
  packets_receive_buf: number;
  bytes_receive_buf: number;
  bytes_avail_receive_buf: number;
  ms_receive_buf: number;
  ms_receive_tsb_pd_delay: number;
}

interface StreamEvent {
  id: number;
  recorded_at: string;
  event_type: string;
  severity: "info" | "warn" | "error";
  message: string;
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.floor((e - s) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function num(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(decimals);
}

const severityColors = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  error: "bg-red-500/10 text-red-400 border-red-500/30",
};

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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function MiniChart({ data, dataKey, color, height = 160, gradientId, filled = false }: {
  data: Record<string, unknown>[];
  dataKey: string;
  color: string;
  height?: number;
  gradientId: string;
  filled?: boolean;
}) {
  if (filled) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 18%)" />
          <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" width={45} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradientId})`} strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
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

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/sessions/${id}`).then((r) => r.json()),
      fetch(`/api/sessions/${id}/snapshots`).then((r) => r.json()),
      fetch(`/api/sessions/${id}/events`).then((r) => r.json()),
    ])
      .then(([sess, snaps, evts]) => {
        setSession(sess);
        setSnapshots(snaps);
        setEvents(evts);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">Loading...</div>;
  }

  if (!session) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">Session not found</div>;
  }

  const chartData = snapshots.map((s) => ({
    time: formatTime(s.recorded_at),
    bitrate: Number(s.bitrate_mbps) || 0,
    receiveRate: Number(s.mbps_receive_rate) || 0,
    sendRate: Number(s.mbps_send_rate) || 0,
    linkCapacity: Number(s.mbps_link_capacity) || 0,
    rtt: Number(s.ms_rtt) || 0,
    lossRate: Number(s.packets_received_loss_rate) || 0,
    sendLossRate: Number(s.packets_send_loss_rate) || 0,
    retrans: Number(s.packets_retrans) || 0,
    receivedLoss: Number(s.packets_received_loss) || 0,
    flightSize: Number(s.packets_flight_size) || 0,
    flowWindow: Number(s.packets_flow_window) || 0,
    receiveBuf: Number(s.ms_receive_buf) || 0,
    sendBuf: Number(s.ms_send_buf) || 0,
    bytesReceived: Number(s.bytes_received) || 0,
    dropped: Number(s.outbound_frames_discarded) || 0,
    receivedDrop: Number(s.packets_received_drop) || 0,
    sendDrop: Number(s.packets_send_drop) || 0,
    nakSent: Number(s.packets_sent_nak) || 0,
    packetsReceived: Number(s.packets_received) || 0,
    receiveBufPackets: Number(s.packets_receive_buf) || 0,
    bytesReceivedLoss: Number(s.bytes_received_loss) || 0,
    health: (() => {
      let score = 100;
      const b = Number(s.bitrate_mbps) || 0;
      const l = Number(s.packets_received_loss_rate) || 0;
      const r = Number(s.ms_rtt) || 0;
      if (b < 2) score -= 30;
      if (b < 1) score -= 30;
      if (l > 1) score -= 20;
      if (l > 5) score -= 30;
      if (r > 100) score -= 10;
      if (r > 250) score -= 20;
      return Math.max(0, score);
    })(),
  }));

  const last = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const first = snapshots.length > 0 ? snapshots[0] : null;

  const avg = (key: keyof Snapshot) => {
    if (snapshots.length === 0) return 0;
    return snapshots.reduce((a, s) => a + (Number(s[key]) || 0), 0) / snapshots.length;
  };
  const max = (key: keyof Snapshot) =>
    snapshots.length === 0 ? 0 : Math.max(...snapshots.map((s) => Number(s[key]) || 0));
  const min = (key: keyof Snapshot) =>
    snapshots.length === 0 ? 0 : Math.min(...snapshots.map((s) => Number(s[key]) || 0));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/sessions" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Session #{session.id}</h1>
            <Badge variant="outline" className="font-mono text-xs">{session.path}</Badge>
            {session.ended_at ? (
              <Badge variant="outline" className="text-muted-foreground border-border text-xs">Ended</Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">Live</Badge>
            )}
          </div>
        </div>
      </div>

      <Card className="bg-card/50 border-border/40">
        <CardHeader className="pb-0 pt-3 px-4">
          <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Session Info</CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
            <div>
              <InfoRow label="Started" value={formatDate(session.started_at)} />
              <InfoRow label="Ended" value={session.ended_at ? formatDate(session.ended_at) : "Still live"} />
              <InfoRow label="Duration" value={formatDuration(session.started_at, session.ended_at)} />
              <InfoRow label="Snapshots" value={snapshots.length} />
            </div>
            <div>
              <InfoRow label="SRT Conn ID" value={session.srt_conn_id} />
              <InfoRow label="Remote Addr" value={first?.remote_addr ?? session.remote_addr ?? "—"} />
              <InfoRow label="MSS" value={last ? `${last.bytes_mss} bytes` : "—"} />
              <InfoRow label="Events" value={events.length} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {[
          { label: "Avg Bitrate", value: `${num(avg("bitrate_mbps"))} Mbps` },
          { label: "Peak Bitrate", value: `${num(max("bitrate_mbps"))} Mbps` },
          { label: "Min Bitrate", value: `${num(min("bitrate_mbps"))} Mbps` },
          { label: "Avg RTT", value: `${num(avg("ms_rtt"), 0)} ms` },
          { label: "Peak RTT", value: `${num(max("ms_rtt"), 0)} ms` },
          { label: "Avg Recv Rate", value: `${num(avg("mbps_receive_rate"))} Mbps` },
          { label: "Peak Loss Rate", value: `${num(max("packets_received_loss_rate"))}%` },
          { label: "Total Received", value: last ? formatBytes(Number(last.bytes_received)) : "—" },
          { label: "Total Loss", value: last ? formatBytes(Number(last.bytes_received_loss)) : "—" },
          { label: "Total Retrans", value: last ? String(last.packets_retrans) : "—" },
          { label: "Total NAKs Sent", value: last ? String(last.packets_sent_nak) : "—" },
          { label: "Frames Dropped", value: last ? String(last.outbound_frames_discarded) : "—" },
          {
            label: "Avg Health",
            value: chartData.length > 0
              ? `${Math.round(chartData.reduce((a, d) => a + d.health, 0) / chartData.length)}/100`
              : "—",
          },
          {
            label: "Min Health",
            value: chartData.length > 0
              ? `${Math.min(...chartData.map((d) => d.health))}/100`
              : "—",
          },
        ].map((s) => (
          <Card key={s.label} className="bg-card/50 border-border/40">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">{s.label}</div>
              <div className="text-sm font-semibold tabular-nums">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="charts">
        <TabsList className="bg-card border border-border/40">
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="events">
            Events{events.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({events.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="raw">
            Raw Data{snapshots.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({snapshots.length})</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="charts" className="mt-4 space-y-3">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No snapshot data</div>
          ) : (
            <>
              <ChartCard title="Health Score" description="Composite score (0–100) based on bitrate, packet loss, and RTT.">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="g-health" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 18%)" />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9 }} stroke="hsl(0 0% 25%)" domain={[0, 100]} width={45} ticks={[0, 25, 50, 75, 100]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey={() => 50} stroke="none" fill="#ef4444" fillOpacity={0.04} dot={false} activeDot={false} name="Poor zone" />
                    <Area type="monotone" dataKey="health" stroke="#34d399" fill="url(#g-health)" strokeWidth={2} dot={false} name="Health" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Calculated Bitrate (Mbps)" description="Throughput derived from bytes_received delta between polls.">
                  <MiniChart data={chartData} dataKey="bitrate" color="#34d399" gradientId="g-bitrate" filled />
                </ChartCard>
                <ChartCard title="SRT Receive Rate (Mbps)" description="SRT's internal receive rate estimate.">
                  <MiniChart data={chartData} dataKey="receiveRate" color="#60a5fa" gradientId="g-recv" filled />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="RTT (ms)" description="Round-trip time between sender and receiver.">
                  <MiniChart data={chartData} dataKey="rtt" color="#fbbf24" gradientId="g-rtt" filled />
                </ChartCard>
                <ChartCard title="Link Capacity (Mbps)" description="Estimated bandwidth capacity of the network path.">
                  <MiniChart data={chartData} dataKey="linkCapacity" color="#818cf8" gradientId="g-lc" filled />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Recv Loss Rate (%)" description="Percentage of packets lost on the receive side.">
                  <MiniChart data={chartData} dataKey="lossRate" color="#f87171" gradientId="g-loss" />
                </ChartCard>
                <ChartCard title="Recv Lost Packets (cumulative)" description="Total number of packets declared lost by the receiver.">
                  <MiniChart data={chartData} dataKey="receivedLoss" color="#fb923c" gradientId="g-rloss" />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Retransmitted Packets (cumulative)" description="Packets the sender re-sent after a loss report.">
                  <MiniChart data={chartData} dataKey="retrans" color="#a78bfa" gradientId="g-retrans" />
                </ChartCard>
                <ChartCard title="NAKs Sent (cumulative)" description="Negative acknowledgements sent by the receiver.">
                  <MiniChart data={chartData} dataKey="nakSent" color="#e879f9" gradientId="g-nak" />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Receive Buffer (ms)" description="How much data is buffered on the receiver side.">
                  <MiniChart data={chartData} dataKey="receiveBuf" color="#2dd4bf" gradientId="g-rbuf" filled />
                </ChartCard>
                <ChartCard title="Flight Size (packets)" description="Packets currently in-flight.">
                  <MiniChart data={chartData} dataKey="flightSize" color="#f472b6" gradientId="g-flight" />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChartCard title="Frames Dropped (outbound)" description="Video frames discarded by MediaMTX.">
                  <MiniChart data={chartData} dataKey="dropped" color="#ef4444" gradientId="g-drop" />
                </ChartCard>
                <ChartCard title="Packets Received (cumulative)" description="Total SRT packets received from the encoder.">
                  <MiniChart data={chartData} dataKey="packetsReceived" color="#4ade80" gradientId="g-pkts" filled />
                </ChartCard>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-0">
              {events.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No events</div>
              ) : (
                <div className="divide-y divide-border/30">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                      <Badge variant="outline" className={`mt-0.5 text-[10px] shrink-0 ${severityColors[e.severity]}`}>
                        {e.severity}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{e.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(e.recorded_at)} &middot; <span className="font-mono">{e.event_type}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <Card className="bg-card/50 border-border/40 overflow-hidden">
            <CardContent className="p-0">
              {snapshots.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No snapshots</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/30 hover:bg-transparent">
                        <TableHead className="text-[10px] pl-3 whitespace-nowrap sticky left-0 bg-card z-10">Time</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Bitrate</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Recv Rate</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Send Rate</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Link Cap</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">RTT</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Loss %</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Pkts Recv</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Pkts Lost</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Retrans</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">NAK Sent</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Flight</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Recv Buf ms</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Recv Buf pkts</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Flow Win</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Bytes Recv</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Bytes Loss</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Dropped</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Recv Drop</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Send Drop</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">Belated</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap pr-3">MSS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshots.map((s) => (
                        <TableRow key={s.id} className="border-border/20 hover:bg-accent/20 font-mono text-[11px]">
                          <TableCell className="pl-3 whitespace-nowrap sticky left-0 bg-card z-10">{formatTime(s.recorded_at)}</TableCell>
                          <TableCell>{num(s.bitrate_mbps)}</TableCell>
                          <TableCell>{num(s.mbps_receive_rate)}</TableCell>
                          <TableCell>{num(s.mbps_send_rate)}</TableCell>
                          <TableCell>{num(s.mbps_link_capacity, 0)}</TableCell>
                          <TableCell>{num(s.ms_rtt, 1)}</TableCell>
                          <TableCell>{num(s.packets_received_loss_rate, 4)}</TableCell>
                          <TableCell>{s.packets_received}</TableCell>
                          <TableCell>{s.packets_received_loss}</TableCell>
                          <TableCell>{s.packets_retrans}</TableCell>
                          <TableCell>{s.packets_sent_nak}</TableCell>
                          <TableCell>{s.packets_flight_size}</TableCell>
                          <TableCell>{s.ms_receive_buf}</TableCell>
                          <TableCell>{s.packets_receive_buf}</TableCell>
                          <TableCell>{s.packets_flow_window}</TableCell>
                          <TableCell>{formatBytes(Number(s.bytes_received))}</TableCell>
                          <TableCell>{formatBytes(Number(s.bytes_received_loss))}</TableCell>
                          <TableCell>{s.outbound_frames_discarded}</TableCell>
                          <TableCell>{s.packets_received_drop}</TableCell>
                          <TableCell>{s.packets_send_drop}</TableCell>
                          <TableCell>{s.packets_received_belated}</TableCell>
                          <TableCell className="pr-3">{s.bytes_mss}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
