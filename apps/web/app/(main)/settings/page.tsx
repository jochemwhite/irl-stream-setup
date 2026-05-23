'use client';

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wifi, WifiOff, RefreshCw, Play, Eye, EyeOff, Timer, X, Plus, Trash2, Copy, Check, ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ObsStatus {
  connected: boolean;
  scene: string | null;
  profile: string | null;
  sceneCollection: string | null;
}

interface ObsConnection {
  host: string;
  port: number;
  password: string;
  enabled: boolean;
}

interface ObsPathConfig {
  path: string;
  profile: string;
  scene_collection: string;
  scene_live: string;
  scene_fallback: string;
  bitrate_min_kbps: number;
  loss_max_pct: number;
  rtt_max_ms: number;
  switch_on_offline: boolean;
  bitrate_trigger_polls: number;
  rtt_trigger_polls: number;
  loss_trigger_polls: number;
  health_trigger_polls: number;
  bitrate_recover_polls: number;
  rtt_recover_polls: number;
  loss_recover_polls: number;
  health_recover_polls: number;
  health_min_score: number | null;
  bitrate_startup_polls: number;
  rtt_startup_polls: number;
  loss_startup_polls: number;
  health_startup_polls: number;
  override_active: boolean;
  override_scene: string | null;
  override_expires_at: string | null;
}

interface ObsScene {
  sceneName: string;
  sceneIndex: number;
}

interface ObsSource {
  sceneItemId: number;
  sourceName: string;
  sceneItemEnabled: boolean;
}

interface SourceRule {
  id: number;
  path: string;
  scene_name: string;
  source_name: string;
  enabled_when_live: boolean;
  enabled_when_fallback: boolean;
}

interface StreamSession {
  path: string;
}

function mergeConfig(defaults: ObsPathConfig, raw: Partial<ObsPathConfig>): ObsPathConfig {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(raw) as [keyof ObsPathConfig, unknown][]) {
    if (v !== null && v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
}

function formatExpiry(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const mins = Math.floor(diff / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function ConnectionSection({ status, onRefresh }: { status: ObsStatus | null; onRefresh: () => void }) {
  const [form, setForm] = useState<ObsConnection>({ host: "localhost", port: 4455, password: "", enabled: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/obs/config")
      .then((d) => {
        if (d.connection) {
          setForm({
            host: d.connection.host ?? "localhost",
            port: d.connection.port ?? 4455,
            password: d.connection.password ?? "",
            enabled: d.connection.enabled ?? false,
          });
        }
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/obs/config/connection", { method: "POST", body: JSON.stringify(form) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh();
    } catch {}
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          OBS Connection
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <Badge variant="outline" className="text-green-500 border-green-500/30 gap-1">
                <Wifi className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground gap-1">
                <WifiOff className="h-3 w-3" /> Disconnected
              </Badge>
            )}
            <Button size="sm" variant="ghost" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {status.scene && <p>Scene: <span className="text-foreground">{status.scene}</span></p>}
            {status.profile && <p>Profile: <span className="text-foreground">{status.profile}</span></p>}
            {status.sceneCollection && <p>Collection: <span className="text-foreground">{status.sceneCollection}</span></p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Host</label>
            <input className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Port</label>
            <input className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Password</label>
          <input className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" type="password" placeholder="Leave blank if none" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>
        <div className="flex items-center gap-2">
          <input id="obs-enabled" type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="rounded" />
          <label htmlFor="obs-enabled" className="text-sm">Enable auto-switching</label>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved!" : "Save & Reconnect"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PathConfigSection({ streamPath, scenes, obsConnected, onSaved }: {
  streamPath: string;
  scenes: ObsScene[];
  obsConnected: boolean;
  onSaved: () => void;
}) {
  const blank: ObsPathConfig = {
    path: streamPath,
    profile: "",
    scene_collection: "",
    scene_live: "",
    scene_fallback: "",
    bitrate_min_kbps: 1000,
    loss_max_pct: 5.0,
    rtt_max_ms: 250,
    switch_on_offline: true,
    bitrate_trigger_polls: 3,
    rtt_trigger_polls: 20,
    loss_trigger_polls: 5,
    health_trigger_polls: 1,
    bitrate_recover_polls: 3,
    rtt_recover_polls: 3,
    loss_recover_polls: 3,
    health_recover_polls: 5,
    health_min_score: null,
    bitrate_startup_polls: 3,
    rtt_startup_polls: 3,
    loss_startup_polls: 3,
    health_startup_polls: 3,
    override_active: false,
    override_scene: null,
    override_expires_at: null,
  };

  const [form, setForm] = useState<ObsPathConfig>(blank);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overrideDuration, setOverrideDuration] = useState(10);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    apiFetch("/api/obs/config")
      .then((d) => {
        const found = (d.paths as ObsPathConfig[]).find((p) => p.path === streamPath);
        if (found) setForm(mergeConfig(blank, found));
      })
      .catch(() => {});
  }, [streamPath]);

  useEffect(() => {
    if (!form.override_active || !form.override_expires_at) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [form.override_active, form.override_expires_at]);

  void tick;

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/obs/config/paths/${encodeURIComponent(streamPath)}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch {}
    setSaving(false);
  }

  async function activateOverride(targetScene: string) {
    await apiFetch("/api/obs/override", {
      method: "POST",
      body: JSON.stringify({ path: streamPath, scene: targetScene, durationMinutes: overrideDuration }),
    });
    setForm((f) => ({
      ...f,
      override_active: true,
      override_scene: targetScene,
      override_expires_at: new Date(Date.now() + overrideDuration * 60_000).toISOString(),
    }));
  }

  async function removeOverride() {
    await apiFetch(`/api/obs/override/${encodeURIComponent(streamPath)}`, { method: "DELETE" });
    setForm((f) => ({ ...f, override_active: false, override_scene: null, override_expires_at: null }));
  }

  const set = <K extends keyof ObsPathConfig>(k: K, v: ObsPathConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const sceneOptions = scenes.filter((s) => !s.sceneName.startsWith("_")).map((s) => s.sceneName);

  function SceneSelect({ label, field }: { label: string; field: "scene_live" | "scene_fallback" }) {
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {obsConnected && sceneOptions.length > 0 ? (
          <select className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={form[field]} onChange={(e) => set(field, e.target.value)}>
            <option value="">— select scene —</option>
            {sceneOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" placeholder="Scene name" value={form[field]} onChange={(e) => set(field, e.target.value)} />
        )}
      </div>
    );
  }

  const expiry = formatExpiry(form.override_expires_at);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">OBS Profile & Scene Collection</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Profile name</label>
            <input className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" placeholder="e.g. StreamProfile" value={form.profile} onChange={(e) => set("profile", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Scene collection</label>
            <input className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" placeholder="e.g. MainCollection" value={form.scene_collection} onChange={(e) => set("scene_collection", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Auto-switch Scenes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <SceneSelect label="Live scene (healthy)" field="scene_live" />
            <SceneSelect label="Fallback scene (bad connection)" field="scene_fallback" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Switch Thresholds</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Min bitrate (Kbps)</label>
              <input type="number" step="100" className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={form.bitrate_min_kbps} onChange={(e) => set("bitrate_min_kbps", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Max packet loss (%)</label>
              <input type="number" step="0.5" className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={form.loss_max_pct} onChange={(e) => set("loss_max_pct", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Max RTT (ms)</label>
              <input type="number" step="10" className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={form.rtt_max_ms} onChange={(e) => set("rtt_max_ms", Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id={`offline-${streamPath}`} type="checkbox" checked={form.switch_on_offline} onChange={(e) => set("switch_on_offline", e.target.checked)} />
            <label htmlFor={`offline-${streamPath}`} className="text-sm">Switch to fallback when stream goes fully offline</label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Switch Rules</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Consecutive polls each metric must be bad/good before OBS switches. Higher = more tolerant of brief spikes.
          </p>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_72px_72px_72px] gap-x-3 items-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Metric</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">Fallback</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">Recovery</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">Startup</span>
          </div>

          {([
            { label: "Bitrate",     fallback: "bitrate_trigger_polls", recover: "bitrate_recover_polls", startup: "bitrate_startup_polls" },
            { label: "Packet loss", fallback: "loss_trigger_polls",    recover: "loss_recover_polls",    startup: "loss_startup_polls" },
            { label: "RTT",         fallback: "rtt_trigger_polls",     recover: "rtt_recover_polls",     startup: "rtt_startup_polls" },
          ] as const).map(({ label, fallback, recover, startup }) => (
            <div key={label} className="grid grid-cols-[1fr_72px_72px_72px] gap-x-3 items-center">
              <span className="text-sm">{label}</span>
              <input type="number" min={1}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-center"
                value={form[fallback]} onChange={(e) => set(fallback, Number(e.target.value))} />
              <input type="number" min={1}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-center"
                value={form[recover]} onChange={(e) => set(recover, Number(e.target.value))} />
              <input type="number" min={1}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-center"
                value={form[startup]} onChange={(e) => set(startup, Number(e.target.value))} />
            </div>
          ))}

          {/* Health score row */}
          <div className="grid grid-cols-[1fr_72px_72px_72px] gap-x-3 items-center">
            <div className="flex items-center gap-2">
              <input id={`health-score-${streamPath}`} type="checkbox" checked={form.health_min_score !== null} onChange={(e) => set("health_min_score", e.target.checked ? 60 : null)} />
              <label htmlFor={`health-score-${streamPath}`} className="text-sm">Health score</label>
            </div>
            <input type="number" min={1} disabled={form.health_min_score === null}
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-center disabled:opacity-40"
              value={form.health_trigger_polls} onChange={(e) => set("health_trigger_polls", Number(e.target.value))} />
            <input type="number" min={1} disabled={form.health_min_score === null}
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-center disabled:opacity-40"
              value={form.health_recover_polls} onChange={(e) => set("health_recover_polls", Number(e.target.value))} />
            <input type="number" min={1} disabled={form.health_min_score === null}
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-center disabled:opacity-40"
              value={form.health_startup_polls} onChange={(e) => set("health_startup_polls", Number(e.target.value))} />
          </div>
          {form.health_min_score !== null && (
            <div className="flex items-center gap-2 pl-6">
              <span className="text-xs text-muted-foreground">Score threshold</span>
              <input type="number" min={0} max={100}
                className="w-20 bg-background border border-border rounded-md px-3 py-1.5 text-sm"
                value={form.health_min_score} onChange={(e) => set("health_min_score", Number(e.target.value))} />
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Override</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {form.override_active ? (
            <div className="flex items-center justify-between rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-yellow-500" />
                <span>Forced: <strong>{form.override_scene}</strong></span>
                {expiry && <span className="text-muted-foreground text-xs">({expiry})</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={removeOverride}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No active override — auto-switching is running.</p>
          )}
          <div className="flex items-center gap-2">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Duration (minutes)</label>
              <input type="number" min={1} className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={overrideDuration} onChange={(e) => setOverrideDuration(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex gap-2">
            {form.scene_live && (
              <Button size="sm" variant="outline" onClick={() => activateOverride(form.scene_live)}>Force live scene</Button>
            )}
            {form.scene_fallback && (
              <Button size="sm" variant="outline" onClick={() => activateOverride(form.scene_fallback!)}>Force fallback scene</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Button size="sm" onClick={save} disabled={saving}>
        {saving ? "Saving…" : saved ? "Saved!" : "Save configuration"}
      </Button>
    </div>
  );
}

function SceneControlSection({ scenes, status }: { scenes: ObsScene[]; status: ObsStatus | null }) {
  const [switching, setSwitching] = useState<string | null>(null);

  async function switchTo(sceneName: string) {
    setSwitching(sceneName);
    try {
      await apiFetch("/api/obs/switch", { method: "POST", body: JSON.stringify({ sceneName }) });
    } catch {}
    setSwitching(null);
  }

  if (!scenes.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Connect to OBS to see available scenes.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Switch Scene</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {[...scenes].filter((s) => !s.sceneName.startsWith("_")).sort((a, b) => a.sceneIndex - b.sceneIndex).map((scene) => (
          <div key={scene.sceneName} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
            <span className="text-sm flex items-center gap-2">
              {scene.sceneName === status?.scene && <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />}
              {scene.sceneName}
            </span>
            <Button size="sm" variant="ghost" disabled={scene.sceneName === status?.scene || switching === scene.sceneName} onClick={() => switchTo(scene.sceneName)}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SourceControlSection({ scenes, streamPath }: { scenes: ObsScene[]; streamPath: string }) {
  const [selectedScene, setSelectedScene] = useState("");
  const [sources, setSources] = useState<ObsSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [rules, setRules] = useState<SourceRule[]>([]);
  const [newRule, setNewRule] = useState({ source_name: "", enabled_when_live: true, enabled_when_fallback: false });

  useEffect(() => {
    if (!selectedScene) return;
    setLoadingSources(true);
    Promise.all([
      apiFetch(`/api/obs/scenes/${encodeURIComponent(selectedScene)}/sources`),
      apiFetch(`/api/obs/config/paths/${encodeURIComponent(streamPath)}/rules`),
    ])
      .then(([srcs, r]) => {
        setSources(srcs as ObsSource[]);
        setRules((r as SourceRule[]).filter((rule) => rule.scene_name === selectedScene));
      })
      .catch(() => {})
      .finally(() => setLoadingSources(false));
  }, [selectedScene, streamPath]);

  async function toggleSource(source: ObsSource) {
    try {
      await apiFetch("/api/obs/source/toggle", {
        method: "POST",
        body: JSON.stringify({ sceneName: selectedScene, sourceName: source.sourceName, enabled: !source.sceneItemEnabled }),
      });
      setSources((prev) => prev.map((s) => s.sceneItemId === source.sceneItemId ? { ...s, sceneItemEnabled: !s.sceneItemEnabled } : s));
    } catch {}
  }

  async function addRule() {
    if (!newRule.source_name) return;
    try {
      const created = await apiFetch(`/api/obs/config/paths/${encodeURIComponent(streamPath)}/rules`, {
        method: "POST",
        body: JSON.stringify({ ...newRule, scene_name: selectedScene }),
      });
      setRules((r) => [...r, created as SourceRule]);
      setNewRule({ source_name: "", enabled_when_live: true, enabled_when_fallback: false });
    } catch {}
  }

  async function deleteRule(id: number) {
    await apiFetch(`/api/obs/config/paths/${encodeURIComponent(streamPath)}/rules/${id}`, { method: "DELETE" });
    setRules((r) => r.filter((rule) => rule.id !== id));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Select Scene</CardTitle></CardHeader>
        <CardContent>
          <select className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={selectedScene} onChange={(e) => setSelectedScene(e.target.value)}>
            <option value="">— pick a scene —</option>
            {scenes.filter((s) => !s.sceneName.startsWith("_")).map((s) => <option key={s.sceneName} value={s.sceneName}>{s.sceneName}</option>)}
          </select>
        </CardContent>
      </Card>

      {selectedScene && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">Sources — {selectedScene}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loadingSources ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sources found.</p>
              ) : (
                sources.map((source) => (
                  <div key={source.sceneItemId} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                    <span className="text-sm">{source.sourceName}</span>
                    <Button size="sm" variant="ghost" onClick={() => toggleSource(source)}>
                      {source.sceneItemEnabled ? <Eye className="h-3.5 w-3.5 text-green-500" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Auto-toggle Rules</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Define which sources OBS should show/hide automatically when the stream is healthy or in fallback.
              </p>
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-sm">
                  <span className="flex-1 font-mono text-xs">{rule.source_name}</span>
                  <span className={`text-xs ${rule.enabled_when_live ? "text-green-500" : "text-muted-foreground"}`}>Live: {rule.enabled_when_live ? "shown" : "hidden"}</span>
                  <span className={`text-xs ${rule.enabled_when_fallback ? "text-green-500" : "text-muted-foreground"}`}>Fallback: {rule.enabled_when_fallback ? "shown" : "hidden"}</span>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(rule.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Source name</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={newRule.source_name} onChange={(e) => setNewRule((r) => ({ ...r, source_name: e.target.value }))}>
                    <option value="">— pick source —</option>
                    {sources.map((s) => <option key={s.sceneItemId} value={s.sourceName}>{s.sourceName}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">When live</label>
                  <select className="bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={newRule.enabled_when_live ? "1" : "0"} onChange={(e) => setNewRule((r) => ({ ...r, enabled_when_live: e.target.value === "1" }))}>
                    <option value="1">Show</option>
                    <option value="0">Hide</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">When fallback</label>
                  <select className="bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={newRule.enabled_when_fallback ? "1" : "0"} onChange={(e) => setNewRule((r) => ({ ...r, enabled_when_fallback: e.target.value === "1" }))}>
                    <option value="1">Show</option>
                    <option value="0">Hide</option>
                  </select>
                </div>
                <Button size="sm" onClick={addRule} disabled={!newRule.source_name}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function OverlaySection() {
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      const base = `${window.location.origin}/overlay`;
      setOverlayUrl(token ? `${base}?token=${token}` : base);
    });
  }, []);

  async function copy() {
    if (!overlayUrl) return;
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Browser Source Overlay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Add this URL as a browser source in OBS or IRL Pro. It shows the active scene and warns when metrics are degrading before an auto-switch.
          The token in the URL is tied to your current session — regenerate it here if it expires.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] font-mono bg-muted rounded-md px-3 py-2 truncate text-muted-foreground">
            {overlayUrl ?? "Loading…"}
          </code>
          <Button size="sm" variant="outline" onClick={copy} disabled={!overlayUrl} className="shrink-0 gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          {overlayUrl && (
            <a href="/overlay" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          Recommended size: 400 × 120 px. Background is transparent — works directly over your stream.
        </p>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [status, setStatus] = useState<ObsStatus | null>(null);
  const [scenes, setScenes] = useState<ObsScene[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const s = await apiFetch("/api/obs/status");
      setStatus(s as ObsStatus);
    } catch {}
  }, []);

  const refreshScenes = useCallback(async () => {
    try {
      const s = await apiFetch("/api/obs/scenes");
      setScenes(s as ObsScene[]);
    } catch {
      setScenes([]);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 5000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.connected) refreshScenes();
    else setScenes([]);
  }, [status?.connected, refreshScenes]);

  useEffect(() => {
    apiFetch("/api/sessions")
      .then((sessions: StreamSession[]) => {
        const unique = [...new Set(sessions.map((s) => s.path))];
        setPaths(unique);
        if (unique.length && !activeTab) setActiveTab(unique[0]);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">OBS WebSocket integration and scene automation</p>
      </div>

      <ConnectionSection status={status} onRefresh={refreshStatus} />

      <OverlaySection />

      <div>
        <h2 className="text-base font-medium mb-4">Per-path Configuration</h2>
        {paths.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stream paths found. Start a stream to configure it.</p>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              {paths.map((p) => <TabsTrigger key={p} value={p}>{p}</TabsTrigger>)}
            </TabsList>
            {paths.map((p) => (
              <TabsContent key={p} value={p} className="mt-4 space-y-8">
                <PathConfigSection streamPath={p} scenes={scenes} obsConnected={status?.connected ?? false} onSaved={refreshStatus} />

                <div className="space-y-3">
                  <div className="border-t border-border/40 pt-6">
                    <h3 className="text-sm font-medium mb-1">Manual Scene Control</h3>
                    <p className="text-xs text-muted-foreground mb-4">Switch OBS scenes directly. Active scene is highlighted.</p>
                    <SceneControlSection scenes={scenes} status={status} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="border-t border-border/40 pt-6">
                    <h3 className="text-sm font-medium mb-1">Source Control</h3>
                    <p className="text-xs text-muted-foreground mb-4">Toggle source visibility per scene, and configure automation rules for auto-switching.</p>
                    <SourceControlSection scenes={scenes} streamPath={p} />
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
