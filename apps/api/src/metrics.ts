import { parseMetrics, getMetric, getAllMetrics } from "./parser";
import { sessions, rtmpReaders } from "./state";
import type { RtmpReaderState } from "./state";
import { supabase } from "./supabase";
import { broadcast } from "./ws";
import { handlePathMetrics, getPathMetricState, resetPathState } from "./obs";
import { calcHealth } from "./health";

const METRICS_URL = process.env.MEDIAMTX_METRICS!;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 1000);

export async function startCollector() {
  console.log("collector started");

  setInterval(async () => {
    try {
      await poll();
    } catch (err) {
      console.error(err);
    }
  }, POLL_INTERVAL);
}

async function poll() {
  const res = await fetch(METRICS_URL);

  const text = await res.text();

  const map = parseMetrics(text);

  const paths = getAllMetrics(map, "paths");

  for (const pathMetric of paths) {
    const path = pathMetric.labels.name;

    const online = pathMetric.labels.state === "ready";

    if (!online) {
      await handlePathMetrics(path, 0, 0, 0, false).catch(() => {});
      await stopSession(path);
      continue;
    }

    const srtConns = getAllMetrics(map, "srt_conns", {
      path,
      state: "publish"
    });

    if (!srtConns.length) continue;

    const conn = srtConns[0];

    const srtId = conn.labels.id;

    let session = sessions.get(path);

    if (!session) {
      session = await createSession(path, srtId);
      sessions.set(path, session);
    }

    const labels = { id: srtId };

    const srt = (name: string) =>
      getMetric(map, `srt_conns_${name}`, labels) || 0;

    const bytesReceived = srt("bytes_received");

    let bitrate = 0;

    if (
      session.lastBytesReceived !== undefined &&
      session.lastBytesTime !== undefined
    ) {
      const diff = bytesReceived - session.lastBytesReceived;

      const elapsed =
        (Date.now() - session.lastBytesTime) / 1000;

      bitrate = (diff * 8) / elapsed / 1_000_000;
    }

    session.lastBytesReceived = bytesReceived;
    session.lastBytesTime = Date.now();

    if (
      session.minBitrate === undefined ||
      bitrate < session.minBitrate
    ) {
      session.minBitrate = bitrate;
    }

    if (
      session.maxBitrate === undefined ||
      bitrate > session.maxBitrate
    ) {
      session.maxBitrate = bitrate;
    }

    await insertSrtSnapshot({
      session_id: session.sessionId,
      srt_conn_id: srtId,
      remote_addr: conn.labels.remoteAddr,
      bitrate_mbps: bitrate,
      mbps_send_rate: srt("mbps_send_rate"),
      mbps_receive_rate: srt("mbps_receive_rate"),
      mbps_link_capacity: srt("mbps_link_capacity"),
      mbps_max_bw: srt("mbps_max_bw"),
      ms_rtt: srt("ms_rtt"),
      us_packets_send_period: srt("us_packets_send_period"),
      us_snd_duration: srt("us_snd_duration"),
      packets_sent: srt("packets_sent"),
      packets_received: srt("packets_received"),
      packets_sent_unique: srt("packets_sent_unique"),
      packets_received_unique: srt("packets_received_unique"),
      packets_send_loss: srt("packets_send_loss"),
      packets_received_loss: srt("packets_received_loss"),
      packets_retrans: srt("packets_retrans"),
      packets_received_retrans: srt("packets_received_retrans"),
      packets_send_drop: srt("packets_send_drop"),
      packets_received_drop: srt("packets_received_drop"),
      packets_received_belated: srt("packets_received_belated"),
      packets_received_undecrypt: srt("packets_received_undecrypt"),
      packets_sent_ack: srt("packets_sent_ack"),
      packets_received_ack: srt("packets_received_ack"),
      packets_sent_nak: srt("packets_sent_nak"),
      packets_received_nak: srt("packets_received_nak"),
      packets_sent_km: srt("packets_sent_km"),
      packets_received_km: srt("packets_received_km"),
      packets_send_loss_rate: srt("packets_send_loss_rate"),
      packets_received_loss_rate: srt("packets_received_loss_rate"),
      packets_reorder_tolerance: srt("packets_reorder_tolerance"),
      packets_received_avg_belated_time: srt("packets_received_avg_belated_time"),
      packets_flow_window: srt("packets_flow_window"),
      packets_flight_size: srt("packets_flight_size"),
      outbound_frames_discarded: srt("outbound_frames_discarded"),
      bytes_sent: srt("bytes_sent"),
      bytes_received: bytesReceived,
      bytes_sent_unique: srt("bytes_sent_unique"),
      bytes_received_unique: srt("bytes_received_unique"),
      bytes_received_loss: srt("bytes_received_loss"),
      bytes_retrans: srt("bytes_retrans"),
      bytes_received_retrans: srt("bytes_received_retrans"),
      bytes_received_belated: srt("bytes_received_belated"),
      bytes_send_drop: srt("bytes_send_drop"),
      bytes_received_drop: srt("bytes_received_drop"),
      bytes_received_undecrypt: srt("bytes_received_undecrypt"),
      bytes_mss: srt("bytes_mss"),
      packets_send_buf: srt("packets_send_buf"),
      bytes_send_buf: srt("bytes_send_buf"),
      bytes_avail_send_buf: srt("bytes_avail_send_buf"),
      ms_send_buf: srt("ms_send_buf"),
      ms_send_tsb_pd_delay: srt("ms_send_tsb_pd_delay"),
      packets_receive_buf: srt("packets_receive_buf"),
      bytes_receive_buf: srt("bytes_receive_buf"),
      bytes_avail_receive_buf: srt("bytes_avail_receive_buf"),
      ms_receive_buf: srt("ms_receive_buf"),
      ms_receive_tsb_pd_delay: srt("ms_receive_tsb_pd_delay"),
    });

    const rtt = srt("ms_rtt");
    const loss = srt("packets_received_loss_rate");
    const healthScore = calcHealth(bitrate, loss, rtt);

    const rtmpDropped = getAllMetrics(
      map,
      "rtmp_conns_outbound_frames_discarded",
      { path }
    ).reduce((a, b) => a + b.value, 0);

    await insertEventIfNeeded(session, {
      bitrate,
      rtt,
      loss,
      dropped: rtmpDropped,
    });

    await handlePathMetrics(path, bitrate, rtt, loss, true, healthScore).catch(() => {});
    const obsState = getPathMetricState(path);

    await insertPathSnapshot({
      session_id: session.sessionId,
      path,
      readers:
        getMetric(map, "paths_readers", {
          name: path
        }) || 0,
      inbound_frames_in_error:
        getMetric(map, "paths_inbound_frames_in_error", {
          name: path
        }) || 0,
      inbound_bytes:
        getMetric(map, "paths_inbound_bytes", {
          name: path
        }) || 0,
      outbound_bytes:
        getMetric(map, "paths_outbound_bytes", {
          name: path
        }) || 0,
      inbound_bitrate_mbps: bitrate,
      obs_bad_bitrate_polls: obsState?.bitrate.bad ?? null,
      obs_bad_rtt_polls:     obsState?.rtt.bad     ?? null,
      obs_bad_loss_polls:    obsState?.loss.bad     ?? null,
    });

    const rtmpConns = getAllMetrics(map, "rtmp_conns", {
      path,
      state: "read",
    });

    const rtmpReadersData = rtmpConns.map((rc) => {
      const rid = rc.labels.id;
      const rlabels = { id: rid };
      const bytesSent =
        getMetric(map, "rtmp_conns_bytes_sent", rlabels) || 0;
      const outboundBytes =
        getMetric(map, "rtmp_conns_outbound_bytes", rlabels) || 0;
      const framesDiscarded =
        getMetric(map, "rtmp_conns_outbound_frames_discarded", rlabels) || 0;

      let readerState = rtmpReaders.get(rid);
      if (!readerState) {
        readerState = {} as RtmpReaderState;
        rtmpReaders.set(rid, readerState);
      }

      let outBitrate = 0;
      if (
        readerState.lastBytesSent !== undefined &&
        readerState.lastBytesTime !== undefined
      ) {
        const diff = bytesSent - readerState.lastBytesSent;
        const elapsed = (Date.now() - readerState.lastBytesTime) / 1000;
        if (elapsed > 0) outBitrate = (diff * 8) / elapsed / 1_000_000;
      }
      readerState.lastBytesSent = bytesSent;
      readerState.lastBytesTime = Date.now();

      return {
        id: rid,
        remote_addr: rc.labels.remoteAddr ?? "",
        bytes_sent: bytesSent,
        outbound_bytes: outboundBytes,
        outbound_frames_discarded: framesDiscarded,
        bitrate_mbps: outBitrate,
      };
    });

    broadcast({
      type: "snapshot",
      session: {
        id: session.sessionId,
        path,
        started_at: new Date(session.startedAt).toISOString(),
        srt_conn_id: srtId,
      },
      rtmp_readers: rtmpReadersData,
      snapshot: {
        bitrate_mbps: bitrate,
        mbps_receive_rate: srt("mbps_receive_rate"),
        mbps_send_rate: srt("mbps_send_rate"),
        mbps_link_capacity: srt("mbps_link_capacity"),
        mbps_max_bw: srt("mbps_max_bw"),
        ms_rtt: srt("ms_rtt"),
        packets_received: srt("packets_received"),
        packets_received_loss: srt("packets_received_loss"),
        packets_received_loss_rate: srt("packets_received_loss_rate"),
        packets_send_loss_rate: srt("packets_send_loss_rate"),
        packets_retrans: srt("packets_retrans"),
        packets_sent_nak: srt("packets_sent_nak"),
        packets_flight_size: srt("packets_flight_size"),
        packets_flow_window: srt("packets_flow_window"),
        packets_received_drop: srt("packets_received_drop"),
        packets_send_drop: srt("packets_send_drop"),
        packets_received_belated: srt("packets_received_belated"),
        ms_receive_buf: srt("ms_receive_buf"),
        ms_receive_tsb_pd_delay: srt("ms_receive_tsb_pd_delay"),
        bytes_received: bytesReceived,
        bytes_received_loss: srt("bytes_received_loss"),
        outbound_frames_discarded: srt("outbound_frames_discarded"),
        remote_addr: conn.labels.remoteAddr,
      },
      path_snapshot: {
        readers: getMetric(map, "paths_readers", { name: path }) || 0,
        inbound_frames_in_error: getMetric(map, "paths_inbound_frames_in_error", { name: path }) || 0,
      },
      obs_counters: obsState ?? null,
    });
  }

  if (sessions.size === 0) {
    broadcast({ type: "offline" });
  }
}

async function createSession(path: string, srtId: string) {
  const { data, error } = await supabase
    .from("stream_sessions")
    .insert({
      path,
      srt_conn_id: srtId
    })
    .select()
    .single();

  if (error) throw error;

  console.log("session started", path);

  await supabase.from("events").insert({
    session_id: data.id,
    event_type: "stream_start",
    severity: "info",
    message: `Stream started for ${path}`
  });

  return {
    sessionId: data.id,
    startedAt: Date.now(),
    alerts: {
      bitrate_critical: false,
      high_loss: false,
      high_rtt: false,
      obs_dropped: false,
    },
  };
}

async function stopSession(path: string) {
  const session = sessions.get(path);

  if (!session) return;

  await supabase
    .from("stream_sessions")
    .update({
      ended_at: new Date().toISOString()
    })
    .eq("id", session.sessionId);

  await supabase.from("events").insert({
    session_id: session.sessionId,
    event_type: "stream_stop",
    severity: "warn",
    message: `Stream stopped for ${path}`
  });

  sessions.delete(path);
  resetPathState(path);

  console.log("session ended", path);
}

async function insertSrtSnapshot(data: any) {
  const { error } = await supabase
    .from("srt_snapshots")
    .insert(data);

  if (error) console.error(error);
}

async function insertPathSnapshot(data: any) {
  const { error } = await supabase
    .from("path_snapshots")
    .insert(data);

  if (error) console.error(error);
}

async function insertEventIfNeeded(
  session: import("./state").StreamState,
  { bitrate, rtt, loss, dropped }: { bitrate: number; rtt: number; loss: number; dropped: number }
) {
  const { alerts } = session;
  const id = session.sessionId;

  async function transition(
    key: keyof typeof alerts,
    active: boolean,
    event_type: string,
    severity: string,
    message: string
  ) {
    if (active === alerts[key]) return;
    alerts[key] = active;
    if (active) {
      await supabase.from("events").insert({ session_id: id, event_type, severity, message });
    }
  }

  await transition(
    "bitrate_critical",
    bitrate < 1,
    "bitrate_critical",
    "error",
    `Bitrate critical: ${bitrate.toFixed(2)} Mbps`
  );

  await transition(
    "high_loss",
    loss > 5,
    "high_loss",
    "warn",
    `Packet loss high: ${loss.toFixed(2)}%`
  );

  await transition(
    "high_rtt",
    rtt > 250,
    "high_rtt",
    "warn",
    `RTT high: ${rtt.toFixed(0)}ms`
  );

  await transition(
    "obs_dropped",
    dropped > 20,
    "obs_dropped",
    "warn",
    `OBS dropping frames`
  );
}