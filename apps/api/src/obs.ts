import OBSWebSocket from "obs-websocket-js";
import { supabase } from "./supabase";
import { broadcast } from "./ws";

const obs = new OBSWebSocket();

let obsConnected = false;
let isConnecting = false;
let currentScene: string | null = null;
let currentProfile: string | null = null;
let currentSceneCollection: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

let streamingActive = false;
let streamingStartedAt: string | null = null;

// ── Scene switch log ──────────────────────────────────────────────────────────

export interface SceneSwitchEntry {
  ts: string;
  path: string;
  from: string | null;
  to: string;
  reason: "auto_fallback" | "auto_recover" | "override" | "manual";
  detail: string;
}

const switchLog: SceneSwitchEntry[] = [];
const MAX_LOG = 100;

function recordSwitch(entry: SceneSwitchEntry) {
  switchLog.unshift(entry);
  if (switchLog.length > MAX_LOG) switchLog.length = MAX_LOG;
  broadcast({ type: "obs_scene_switch", entry });
}

export function getSceneSwitchLog(): SceneSwitchEntry[] {
  return [...switchLog];
}

export interface PathMetricState {
  bitrate: { bad: number; good: number; fallbackThreshold: number; recoverThreshold: number };
  rtt:     { bad: number; good: number; fallbackThreshold: number; recoverThreshold: number };
  loss:    { bad: number; good: number; fallbackThreshold: number; recoverThreshold: number };
  inFallback: boolean;
}

export function getPathMetricState(path: string): PathMetricState | null {
  const state  = switchState.get(path);
  const cached = configCache.get(path);
  if (!state || !cached) return null;
  const c = cached.config;
  return {
    bitrate: { bad: state.consecutiveBadBitrate, good: state.consecutiveGoodBitrate, fallbackThreshold: c.bitrate_trigger_polls, recoverThreshold: c.bitrate_recover_polls },
    rtt:     { bad: state.consecutiveBadRtt,     good: state.consecutiveGoodRtt,     fallbackThreshold: c.rtt_trigger_polls,     recoverThreshold: c.rtt_recover_polls },
    loss:    { bad: state.consecutiveBadLoss,    good: state.consecutiveGoodLoss,    fallbackThreshold: c.loss_trigger_polls,    recoverThreshold: c.loss_recover_polls },
    inFallback: state.inFallback,
  };
}

// Per-path config cache (refreshed every 10s)
const configCache = new Map<string, { config: ObsPathConfig; fetchedAt: number }>();
const CONFIG_TTL = 10_000;

// Per-path in-memory streak state for trigger logic
interface PathSwitchState {
  // Fallback: bad poll counters per metric
  consecutiveBadBitrate: number;
  consecutiveBadRtt: number;
  consecutiveBadLoss: number;
  consecutiveBadHealth: number;
  // Recovery / startup: good poll counters per metric
  consecutiveGoodBitrate: number;
  consecutiveGoodRtt: number;
  consecutiveGoodLoss: number;
  consecutiveGoodHealth: number;
  inFallback: boolean;
  // Startup gate: true until first N good polls have been seen
  inStartup: boolean;
}
const switchState = new Map<string, PathSwitchState>();

function getOrInitState(path: string): PathSwitchState {
  if (!switchState.has(path)) {
    switchState.set(path, {
      consecutiveBadBitrate: 0,
      consecutiveBadRtt: 0,
      consecutiveBadLoss: 0,
      consecutiveBadHealth: 0,
      consecutiveGoodBitrate: 0,
      consecutiveGoodRtt: 0,
      consecutiveGoodLoss: 0,
      consecutiveGoodHealth: 0,
      inFallback: false,
      inStartup: true,
    });
  }
  return switchState.get(path)!;
}

export interface ObsPathConfig {
  path: string;
  profile: string | null;
  scene_collection: string | null;
  scene_live: string | null;
  scene_fallback: string | null;
  bitrate_min_kbps: number;
  loss_max_pct: number;
  rtt_max_ms: number;
  switch_on_offline: boolean;
  // Per-metric fallback triggers (consecutive bad polls)
  bitrate_trigger_polls: number;
  rtt_trigger_polls: number;
  loss_trigger_polls: number;
  health_trigger_polls: number;
  // Per-metric recovery triggers (consecutive good polls)
  bitrate_recover_polls: number;
  rtt_recover_polls: number;
  loss_recover_polls: number;
  health_recover_polls: number;
  health_min_score: number | null;
  // Per-metric startup gate (consecutive good polls before going live for the first time)
  bitrate_startup_polls: number;
  rtt_startup_polls: number;
  loss_startup_polls: number;
  health_startup_polls: number;
  // Override
  override_active: boolean;
  override_scene: string | null;
  override_expires_at: string | null;
}

interface ObsConnection {
  host: string;
  port: number;
  password: string | null;
  enabled: boolean;
}

// ── Init & connection ─────────────────────────────────────────────────────────

export async function initObs() {
  obs.on("ConnectionClosed", () => {
    // Ignore disconnects we triggered ourselves (e.g. obs.connect() closing a prior session)
    if (isConnecting) return;
    obsConnected = false;
    currentScene = null;
    streamingActive = false;
    streamingStartedAt = null;
    broadcast({ type: "obs_status", connected: false });
    broadcast({ type: "obs_stream_status", streaming: false, startedAt: null });
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(reconnect, 2000);
    }
  });

  obs.on("CurrentProgramSceneChanged", ({ sceneName }) => {
    currentScene = sceneName;
    broadcast({ type: "obs_scene_changed", scene: sceneName });
  });

  obs.on("StreamStateChanged", ({ outputActive }) => {
    streamingActive = outputActive;
    streamingStartedAt = outputActive ? new Date().toISOString() : null;
    broadcast({ type: "obs_stream_status", streaming: streamingActive, startedAt: streamingStartedAt });
  });

  await reconnect();
}

async function reconnect() {
  reconnectTimer = null;
  const conn = await getConnection();
  if (!conn?.enabled) return;

  isConnecting = true;
  try {
    await obs.connect(
      `ws://${conn.host}:${conn.port}`,
      conn.password ?? undefined
    );
    obsConnected = true;
    isConnecting = false;

    const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
    currentScene = currentProgramSceneName;

    const { currentProfileName } = await obs.call("GetProfileList");
    currentProfile = currentProfileName;

    const { currentSceneCollectionName } = await obs.call("GetSceneCollectionList");
    currentSceneCollection = currentSceneCollectionName;

    const { outputActive } = await obs.call("GetStreamStatus");
    streamingActive = outputActive;
    // Can't recover the exact start time after a reconnect, so leave it null if already streaming
    if (!outputActive) streamingStartedAt = null;

    broadcast({ type: "obs_status", connected: true, scene: currentScene });
    broadcast({ type: "obs_stream_status", streaming: streamingActive, startedAt: streamingStartedAt });
    console.log("OBS connected");
  } catch {
    isConnecting = false;
    reconnectTimer = setTimeout(reconnect, 5000);
  }
}

async function getConnection(): Promise<ObsConnection | null> {
  const { data } = await supabase
    .from("obs_connection")
    .select("*")
    .eq("id", 1)
    .single();
  return data;
}

async function getPathConfig(path: string): Promise<ObsPathConfig | null> {
  const cached = configCache.get(path);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL) return cached.config;

  const { data } = await supabase
    .from("obs_path_config")
    .select("*")
    .eq("path", path)
    .single();

  if (!data) return null;
  configCache.set(path, { config: data as ObsPathConfig, fetchedAt: Date.now() });
  return data as ObsPathConfig;
}

export function invalidatePathCache(path: string) {
  configCache.delete(path);
}

// Called when a stream session ends so the startup gate re-runs next session
export function resetPathState(path: string) {
  switchState.delete(path);
}

// ── Health computation ────────────────────────────────────────────────────────

function triggerMet(
  type: "immediate" | "polls" | "seconds",
  value: number,
  consecutivePolls: number,
  sinceMs: number | null
): boolean {
  if (type === "immediate") return true;
  if (type === "polls") return consecutivePolls >= value;
  if (type === "seconds") return sinceMs != null && (Date.now() - sinceMs) / 1000 >= value;
  return false;
}

function buildFallbackDetail(
  config: ObsPathConfig,
  bitrate: number,
  rtt: number,
  loss: number,
  online: boolean,
  healthScore: number | null,
  state: PathSwitchState
): string {
  const causes: string[] = [];
  if (!online && config.switch_on_offline) causes.push("stream offline");
  if (bitrate * 1000 < config.bitrate_min_kbps)
    causes.push(`bitrate ${(bitrate * 1000).toFixed(0)} Kbps < ${config.bitrate_min_kbps} Kbps for ${state.consecutiveBadBitrate} polls`);
  if (loss > config.loss_max_pct)
    causes.push(`loss ${loss.toFixed(1)}% > ${config.loss_max_pct}% for ${state.consecutiveBadLoss} polls`);
  if (rtt > config.rtt_max_ms)
    causes.push(`RTT ${rtt.toFixed(0)} ms > ${config.rtt_max_ms} ms for ${state.consecutiveBadRtt} polls`);
  if (config.health_min_score != null && healthScore != null && healthScore < config.health_min_score)
    causes.push(`health score ${healthScore} < ${config.health_min_score}`);
  return `Fallback — ${causes.join(", ") || "thresholds breached"}`;
}

function buildRecoverDetail(_config: ObsPathConfig, state: PathSwitchState): string {
  const min = Math.min(state.consecutiveGoodBitrate, state.consecutiveGoodRtt, state.consecutiveGoodLoss);
  return `Recovered after ${min} consecutive good polls`;
}

// ── Main poll handler (called from metrics.ts) ────────────────────────────────

export async function handlePathMetrics(
  path: string,
  bitrate: number,
  rtt: number,
  loss: number,
  online: boolean,
  healthScore: number | null = null
) {
  if (!obsConnected) return;

  const config = await getPathConfig(path);
  if (!config) return;

  // Clear expired overrides
  if (config.override_active && config.override_expires_at) {
    if (new Date(config.override_expires_at) <= new Date()) {
      await supabase
        .from("obs_path_config")
        .update({ override_active: false, override_scene: null, override_expires_at: null })
        .eq("path", path);
      invalidatePathCache(path);
      config.override_active = false;
      config.override_scene = null;
    }
  }

  // Override bypasses all trigger logic
  if (config.override_active && config.override_scene) {
    await switchToScene(path, config.override_scene, config, true, "override", `Override: forced to "${config.override_scene}"`);
    return;
  }

  const state = getOrInitState(path);

  // Per-metric health checks
  const offlineOk   = online || !config.switch_on_offline;
  const bitrateOk   = online ? bitrate * 1000 >= config.bitrate_min_kbps : !config.switch_on_offline;
  const rttOk       = rtt <= config.rtt_max_ms;
  const lossOk      = loss <= config.loss_max_pct;
  const healthOk    = config.health_min_score == null || healthScore == null || healthScore >= config.health_min_score;

  // Update per-metric bad/good counters
  bitrateOk ? (state.consecutiveBadBitrate  = 0, state.consecutiveGoodBitrate++) : (state.consecutiveGoodBitrate  = 0, state.consecutiveBadBitrate++);
  rttOk     ? (state.consecutiveBadRtt      = 0, state.consecutiveGoodRtt++)     : (state.consecutiveGoodRtt      = 0, state.consecutiveBadRtt++);
  lossOk    ? (state.consecutiveBadLoss     = 0, state.consecutiveGoodLoss++)    : (state.consecutiveGoodLoss     = 0, state.consecutiveBadLoss++);
  healthOk  ? (state.consecutiveBadHealth   = 0, state.consecutiveGoodHealth++)  : (state.consecutiveGoodHealth   = 0, state.consecutiveBadHealth++);

  const shouldFallback =
    !offlineOk ||
    (!bitrateOk && state.consecutiveBadBitrate >= config.bitrate_trigger_polls) ||
    (!rttOk     && state.consecutiveBadRtt     >= config.rtt_trigger_polls)     ||
    (!lossOk    && state.consecutiveBadLoss    >= config.loss_trigger_polls)    ||
    (!healthOk  && state.consecutiveBadHealth  >= config.health_trigger_polls);

  const startupPasses =
    offlineOk &&
    state.consecutiveGoodBitrate >= config.bitrate_startup_polls &&
    state.consecutiveGoodRtt     >= config.rtt_startup_polls     &&
    state.consecutiveGoodLoss    >= config.loss_startup_polls    &&
    (config.health_min_score == null || state.consecutiveGoodHealth >= config.health_startup_polls);

  const recovered =
    offlineOk &&
    state.consecutiveGoodBitrate >= config.bitrate_recover_polls &&
    state.consecutiveGoodRtt     >= config.rtt_recover_polls     &&
    state.consecutiveGoodLoss    >= config.loss_recover_polls    &&
    (config.health_min_score == null || state.consecutiveGoodHealth >= config.health_recover_polls);

  // Startup gate: wait for N good polls before going live for the first time
  if (state.inStartup) {
    if (shouldFallback && config.scene_fallback) {
      // Bad quality at startup → go straight to fallback
      const detail = buildFallbackDetail(config, bitrate, rtt, loss, online, healthScore, state);
      await switchToScene(path, config.scene_fallback, config, false, "auto_fallback", detail);
      state.inStartup = false;
      state.inFallback = true;
    } else if (startupPasses && config.scene_live) {
      await switchToScene(path, config.scene_live, config, true, "auto_recover", `Startup complete`);
      state.inStartup = false;
    }
    return;
  }

  if (state.inFallback && recovered && config.scene_live) {
    const detail = buildRecoverDetail(config, state);
    await switchToScene(path, config.scene_live, config, true, "auto_recover", detail);
    state.inFallback = false;
  }

  if (!state.inFallback && shouldFallback && config.scene_fallback) {
    const detail = buildFallbackDetail(config, bitrate, rtt, loss, online, healthScore, state);
    await switchToScene(path, config.scene_fallback, config, false, "auto_fallback", detail);
    state.inFallback = true;
  }
}

async function switchToScene(
  path: string,
  sceneName: string,
  config: ObsPathConfig,
  isLive: boolean,
  reason: SceneSwitchEntry["reason"],
  detail: string
) {
  await ensureProfileAndCollection(config);

  if (sceneName !== currentScene) {
    const from = currentScene;
    try {
      await obs.call("SetCurrentProgramScene", { sceneName });
      currentScene = sceneName;
      recordSwitch({ ts: new Date().toISOString(), path, from, to: sceneName, reason, detail });
    } catch (err) {
      console.error("OBS scene switch failed:", err);
      return;
    }
  }

  await applySourceRules(path, sceneName, isLive);
}

async function ensureProfileAndCollection(config: ObsPathConfig) {
  if (config.profile && config.profile !== currentProfile) {
    try {
      await obs.call("SetCurrentProfile", { profileName: config.profile });
      currentProfile = config.profile;
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error("OBS profile switch failed:", err);
    }
  }

  if (config.scene_collection && config.scene_collection !== currentSceneCollection) {
    try {
      await obs.call("SetCurrentSceneCollection", {
        sceneCollectionName: config.scene_collection,
      });
      currentSceneCollection = config.scene_collection;
      await new Promise((r) => setTimeout(r, 1000));
      const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
      currentScene = currentProgramSceneName;
    } catch (err) {
      console.error("OBS scene collection switch failed:", err);
    }
  }
}

async function applySourceRules(path: string, sceneName: string, isLive: boolean) {
  const { data: rules } = await supabase
    .from("obs_source_rules")
    .select("*")
    .eq("path", path)
    .eq("scene_name", sceneName);

  if (!rules?.length) return;

  let sceneItems: { sceneItemId: number; sourceName: string }[] = [];
  try {
    const result = await obs.call("GetSceneItemList", { sceneName });
    sceneItems = result.sceneItems as { sceneItemId: number; sourceName: string }[];
  } catch {
    return;
  }

  for (const rule of rules) {
    const item = sceneItems.find((i) => i.sourceName === rule.source_name);
    if (!item) continue;
    const enabled = isLive ? rule.enabled_when_live : rule.enabled_when_fallback;
    try {
      await obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: enabled,
      });
    } catch (err) {
      console.error(`OBS source toggle failed for ${rule.source_name}:`, err);
    }
  }
}

// ── Public API for HTTP routes ────────────────────────────────────────────────

export function getConnectionStatus() {
  return {
    connected: obsConnected,
    scene: currentScene,
    profile: currentProfile,
    sceneCollection: currentSceneCollection,
    streaming: streamingActive,
    streamingStartedAt,
  };
}

export async function startStream() {
  if (!obsConnected) throw new Error("OBS not connected");
  await obs.call("StartStream");
}

export async function stopStream() {
  if (!obsConnected) throw new Error("OBS not connected");
  await obs.call("StopStream");
}

export async function getObsScenes() {
  if (!obsConnected) throw new Error("OBS not connected");
  const { scenes } = await obs.call("GetSceneList");
  return scenes;
}

export async function getObsSources(sceneName: string) {
  if (!obsConnected) throw new Error("OBS not connected");
  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
  return sceneItems;
}

export async function setObsScene(sceneName: string) {
  if (!obsConnected) throw new Error("OBS not connected");
  const from = currentScene;
  await obs.call("SetCurrentProgramScene", { sceneName });
  currentScene = sceneName;
  recordSwitch({ ts: new Date().toISOString(), path: "", from, to: sceneName, reason: "manual", detail: "Manually switched from dashboard" });
}

export async function setSourceEnabled(
  sceneName: string,
  sourceName: string,
  enabled: boolean
) {
  if (!obsConnected) throw new Error("OBS not connected");
  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
  const item = (sceneItems as { sceneItemId: number; sourceName: string }[]).find(
    (i) => i.sourceName === sourceName
  );
  if (!item) throw new Error(`Source "${sourceName}" not found in scene "${sceneName}"`);
  await obs.call("SetSceneItemEnabled", {
    sceneName,
    sceneItemId: item.sceneItemId,
    sceneItemEnabled: enabled,
  });
}

export async function setOverride(
  path: string,
  scene: string,
  durationMinutes?: number
) {
  const expires = durationMinutes
    ? new Date(Date.now() + durationMinutes * 60_000).toISOString()
    : null;

  await supabase
    .from("obs_path_config")
    .update({ override_active: true, override_scene: scene, override_expires_at: expires })
    .eq("path", path);

  invalidatePathCache(path);
}

export async function clearOverride(path: string) {
  await supabase
    .from("obs_path_config")
    .update({ override_active: false, override_scene: null, override_expires_at: null })
    .eq("path", path);

  invalidatePathCache(path);

  // Mark as inFallback so the recovery logic re-evaluates on the next poll
  // and switches back to the live scene if metrics are good.
  const state = getOrInitState(path);
  state.inFallback = true;
  state.consecutiveGoodBitrate = 0;
  state.consecutiveGoodRtt = 0;
  state.consecutiveGoodLoss = 0;
  state.consecutiveGoodHealth = 0;
}

export async function reconnectObs() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (obsConnected) {
    isConnecting = true;
    try { await obs.disconnect(); } catch {}
    isConnecting = false;
    obsConnected = false;
  }
  await reconnect();
}
