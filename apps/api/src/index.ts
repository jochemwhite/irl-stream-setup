import { startCollector } from "./metrics";
import { supabase } from "./supabase";
import { addClient, removeClient } from "./ws";
import { isAuthenticated } from "./auth";
import {
  initObs,
  getConnectionStatus,
  getObsScenes,
  getObsSources,
  setObsScene,
  setSourceEnabled,
  restartMediaSource,
  setOverride,
  clearOverride,
  startStream,
  stopStream,
  reconnectObs,
  getSceneSwitchLog,
  invalidatePathCache,
} from "./obs";

const PORT = Number(process.env.PORT || 8000);

await startCollector();
await initObs();

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function parseBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (path === "/health") {
      return new Response("ok");
    }

    if (path === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (!(await isAuthenticated(req))) {
      return json({ error: "Unauthorized" }, 401);
    }

    let match: RegExpMatchArray | null;

    // ── Sessions ──────────────────────────────────────────────────────────────

    match = path.match(/^\/api\/sessions\/(\d+)\/snapshots$/);
    if (match) {
      const sessionId = match[1];
      const { data, error } = await supabase
        .from("srt_snapshots")
        .select("*")
        .eq("session_id", sessionId)
        .order("recorded_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    match = path.match(/^\/api\/sessions\/(\d+)\/events$/);
    if (match) {
      const sessionId = match[1];
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("session_id", sessionId)
        .order("recorded_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    match = path.match(/^\/api\/sessions\/(\d+)$/);
    if (match) {
      const sessionId = match[1];
      const { data, error } = await supabase
        .from("stream_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (error) return json({ error: error.message }, 404);
      return json(data);
    }

    if (path === "/api/sessions") {
      const { data, error } = await supabase
        .from("stream_sessions")
        .select("id, path, srt_conn_id, started_at, ended_at")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // ── OBS status & scenes ───────────────────────────────────────────────────

    if (path === "/api/obs/status") {
      return json(getConnectionStatus());
    }

    if (path === "/api/obs/switch-log") {
      return json(getSceneSwitchLog());
    }

    if (path === "/api/obs/scenes") {
      try {
        return json(await getObsScenes());
      } catch (err: any) {
        return json({ error: err.message }, 503);
      }
    }

    match = path.match(/^\/api\/obs\/scenes\/([^/]+)\/sources$/);
    if (match) {
      const sceneName = decodeURIComponent(match[1]);
      try {
        return json(await getObsSources(sceneName));
      } catch (err: any) {
        return json({ error: err.message }, 503);
      }
    }

    // ── OBS config ────────────────────────────────────────────────────────────

    if (path === "/api/obs/config") {
      const [{ data: conn }, { data: paths }] = await Promise.all([
        supabase.from("obs_connection").select("*").eq("id", 1).single(),
        supabase.from("obs_path_config").select("*"),
      ]);
      return json({ connection: conn, paths: paths ?? [] });
    }

    if (path === "/api/obs/config/connection" && method === "POST") {
      const body = await parseBody(req);
      const { error } = await supabase
        .from("obs_connection")
        .upsert({ id: 1, ...body, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 500);
      try { await reconnectObs(); } catch {}
      return json({ ok: true });
    }

    match = path.match(/^\/api\/obs\/config\/paths\/([^/]+)\/rules$/);
    if (match) {
      const streamPath = decodeURIComponent(match[1]);

      if (method === "GET") {
        const { data, error } = await supabase
          .from("obs_source_rules")
          .select("*")
          .eq("path", streamPath);
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }

      if (method === "POST") {
        const body = await parseBody(req);
        const { data, error } = await supabase
          .from("obs_source_rules")
          .insert({ ...body, path: streamPath })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json(data, 201);
      }
    }

    match = path.match(/^\/api\/obs\/config\/paths\/([^/]+)\/rules\/(\d+)$/);
    if (match && method === "DELETE") {
      const ruleId = match[2];
      const { error } = await supabase.from("obs_source_rules").delete().eq("id", ruleId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    match = path.match(/^\/api\/obs\/config\/paths\/([^/]+)$/);
    if (match && method === "PUT") {
      const streamPath = decodeURIComponent(match[1]);
      const body = await parseBody(req);
      const { error } = await supabase
        .from("obs_path_config")
        .upsert({ ...body, path: streamPath, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 500);
      invalidatePathCache(streamPath);
      return json({ ok: true });
    }

    // ── OBS manual controls ───────────────────────────────────────────────────

    if (path === "/api/obs/stream/start" && method === "POST") {
      try { await startStream(); return json({ ok: true }); }
      catch (err: any) { return json({ error: err.message }, 503); }
    }

    if (path === "/api/obs/stream/stop" && method === "POST") {
      try { await stopStream(); return json({ ok: true }); }
      catch (err: any) { return json({ error: err.message }, 503); }
    }

    if (path === "/api/obs/switch" && method === "POST") {
      const { sceneName } = await parseBody(req);
      try {
        await setObsScene(sceneName);
        return json({ ok: true });
      } catch (err: any) {
        return json({ error: err.message }, 503);
      }
    }

    if (path === "/api/obs/source/toggle" && method === "POST") {
      const { sceneName, sourceName, enabled } = await parseBody(req);
      try {
        await setSourceEnabled(sceneName, sourceName, enabled);
        return json({ ok: true });
      } catch (err: any) {
        return json({ error: err.message }, 503);
      }
    }

    if (path === "/api/obs/source/restart" && method === "POST") {
      const { inputName } = await parseBody(req);
      try {
        await restartMediaSource(inputName);
        return json({ ok: true });
      } catch (err: any) {
        return json({ error: err.message }, 503);
      }
    }

    if (path === "/api/obs/override" && method === "POST") {
      const { path: streamPath, scene, durationMinutes } = await parseBody(req);
      await setOverride(streamPath, scene, durationMinutes);
      return json({ ok: true });
    }

    match = path.match(/^\/api\/obs\/override\/([^/]+)$/);
    if (match && method === "DELETE") {
      const streamPath = decodeURIComponent(match[1]);
      await clearOverride(streamPath);
      return json({ ok: true });
    }

    if (path === "/api/overlay-token" && method === "GET") {
      const { data } = await supabase.from("obs_connection").select("overlay_token").eq("id", 1).single();
      if (data?.overlay_token) return json({ token: data.overlay_token });
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await supabase.from("obs_connection").upsert({ id: 1, overlay_token: token });
      return json({ token });
    }

    if (path === "/api/overlay-token/regenerate" && method === "POST") {
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await supabase.from("obs_connection").upsert({ id: 1, overlay_token: token });
      return json({ token });
    }

    return new Response("API online", { status: 200 });
  },

  websocket: {
    open(ws) {
      addClient(ws);
      // Push current OBS state immediately so the client doesn't wait for the next event
      const obsStatus = getConnectionStatus();
      ws.send(JSON.stringify({ type: "obs_status", connected: obsStatus.connected, scene: obsStatus.scene }));
    },
    close(ws) {
      removeClient(ws);
    },
    message() {},
  },
});

console.log(`dashboard: http://localhost:${PORT}`);
