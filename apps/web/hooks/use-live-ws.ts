'use client';

import { useState, useEffect, useRef } from "react";

export interface RtmpReader {
  id: string;
  remote_addr: string;
  bytes_sent: number;
  outbound_bytes: number;
  outbound_frames_discarded: number;
  bitrate_mbps: number;
}

export interface ObsMetricCounter {
  bad: number;
  threshold: number;
}

export interface ObsCounters {
  bitrate:    ObsMetricCounter;
  rtt:        ObsMetricCounter;
  loss:       ObsMetricCounter;
  inFallback: boolean;
}

export interface SnapshotMessage {
  type: "snapshot";
  session: {
    id: number;
    path: string;
    started_at: string;
    srt_conn_id: string;
  };
  snapshot: Record<string, number | string>;
  path_snapshot: Record<string, number>;
  rtmp_readers: RtmpReader[];
  obs_counters: ObsCounters | null;
}

interface OfflineMessage {
  type: "offline";
}

export interface ObsStatusMessage {
  type: "obs_status";
  connected: boolean;
  scene?: string;
}

export interface ObsStreamStatusMessage {
  type: "obs_stream_status";
  streaming: boolean;
  startedAt: string | null;
}

export interface SceneSwitchEntry {
  ts: string;
  path: string;
  from: string | null;
  to: string;
  reason: "auto_fallback" | "auto_recover" | "override" | "manual";
  detail: string;
}

type WsMessage = SnapshotMessage | OfflineMessage | ObsStatusMessage | ObsStreamStatusMessage | { type: "obs_scene_changed"; scene: string } | { type: "obs_scene_switch"; entry: SceneSwitchEntry };

export function useLiveWs() {
  const [message, setMessage] = useState<SnapshotMessage | OfflineMessage | null>(null);
  const [obsStatus, setObsStatus] = useState<ObsStatusMessage | null>(null);
  const [obsStreamStatus, setObsStreamStatus] = useState<ObsStreamStatusMessage | null>(null);
  const [sceneSwitchLog, setSceneSwitchLog] = useState<SceneSwitchEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function connect() {
      const rawUrl = process.env.NEXT_PUBLIC_WS_URL ??
        `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
      // Replace localhost so phones on the same LAN connect to the server, not themselves
      const wsUrl = rawUrl.replace(/localhost|127\.0\.0\.1/, window.location.hostname);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        try {
          const msg: WsMessage = JSON.parse(e.data);
          if (msg.type === "obs_status") {
            setObsStatus(msg);
          } else if (msg.type === "obs_stream_status") {
            setObsStreamStatus(msg);
          } else if (msg.type === "obs_scene_changed") {
            setObsStatus((prev) => prev ? { ...prev, scene: msg.scene } : { type: "obs_status", connected: true, scene: msg.scene });
          } else if (msg.type === "obs_scene_switch") {
            setSceneSwitchLog((prev) => [msg.entry, ...prev].slice(0, 50));
          } else {
            setMessage(msg);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { message, connected, obsStatus, obsStreamStatus, sceneSwitchLog };
}
