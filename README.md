# IRL Stream Setup

A self-hosted monitoring and control system for IRL streaming. Ingests an SRT stream via MediaMTX, tracks stream health metrics, and automatically controls OBS scene switching based on bitrate, RTT, and packet loss. Includes a mobile-optimised Stream Deck interface for on-the-go scene control.

## Architecture

```
Phone ──SRT──► MediaMTX ──stream──► OBS ──► Twitch
                  │
                  │ Prometheus metrics
                  ▼
              API (Bun)  ◄──── Supabase (config + history)
                  │
                  ├── WebSocket ──► Web Dashboard
                  │
                  └── OBS WebSocket ──► OBS (auto scene switching)
```

- **MediaMTX** — receives the SRT ingest, exposes Prometheus metrics
- **API** (`apps/api`) — polls MediaMTX metrics, calculates stream health, controls OBS, stores sessions in Supabase
- **Web** (`apps/web`) — Next.js dashboard with real-time metrics + a mobile Stream Deck page at `/deck`
- **Supabase** — stores stream sessions, SRT snapshots, events, and OBS configuration

## Features

- Real-time SRT stream health monitoring (bitrate, RTT, packet loss, health score)
- Automatic OBS scene switching on stream degradation and recovery
- Manual override from the `/deck` page with auto-recovery when cleared
- Mobile Stream Deck (`/deck`) — scene buttons, start/stop stream, Twitch actions
- Scene switch log with reasons (auto fallback / recover / manual / override)
- Historical session browser with per-session metric graphs
- OBS connection config and per-path scene rules via the settings page

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| API | Bun HTTP + WebSocket |
| Frontend | Next.js 16, Tailwind CSS v4, shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Media server | [MediaMTX](https://github.com/bluenviron/mediamtx) |
| OBS control | [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js) v5 |
| Deployment | Docker Compose |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Docker](https://docker.com) + Docker Compose
- A running [MediaMTX](https://github.com/bluenviron/mediamtx) instance with Prometheus metrics enabled
- OBS with [obs-websocket](https://obsproject.com/forum/resources/obs-websocket-remote-control-obs-studio-from-websockets.466/) v5
- A [Supabase](https://supabase.com) project

### 1. Clone & install

```bash
git clone https://github.com/jochemwhite/irl-stream-setup.git
cd irl-stream-setup
bun install
```

### 2. Configure the API

Copy and fill in `apps/api/.env`:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MediaMTX Prometheus metrics endpoint
MEDIAMTX_METRICS=http://your-mediamtx-host:9998/metrics

# Polling interval in ms (default: 1000)
POLL_INTERVAL=1000

# API port (default: 8000)
PORT=8000
```

### 3. Configure the web app

Copy and fill in `apps/web/.env.local`:

```env
# Direct WebSocket URL to the API (must not go through Next.js proxy)
NEXT_PUBLIC_WS_URL=ws://your-server-host:8000/ws

# MediaMTX WebRTC/WHEP endpoint for the stream preview player
NEXT_PUBLIC_MEDIAMTX_URL=http://your-mediamtx-host:8889

# Comma-separated list of LAN origins allowed in Next.js dev mode
ALLOWED_DEV_ORIGINS=192.168.x.x
```

### 4. Run the Supabase migration

Apply the schema to your Supabase project:

```bash
# Using the Supabase CLI
supabase db push

# Or paste supabase-obs-migration.sql into the Supabase SQL editor
```

### 5. Run in development

```bash
# API
cd apps/api && bun run src/index.ts

# Web (separate terminal)
cd apps/web && bun dev
```

### 6. Run with Docker Compose

```bash
docker compose up -d
```

The web dashboard is available at `http://localhost:3000` and the Stream Deck at `http://localhost:3000/deck`.

## Mobile Stream Deck (`/deck`)

Open `http://your-server-host:3000/deck` on your phone.

- **Scene buttons** — tap to switch OBS scenes. Switching sets a manual override so automatic metric-based switching is paused
- **Override banner** — shown when a manual override is active. Tap **Clear** to resume automatic switching
- **Start / Stop stream** — controls OBS stream output directly, with live uptime counter
- **Action buttons** — Clip, Marker, Wheel, Ad Break (wired to Next.js Server Actions in `apps/web/actions/`)
- **Scene log drawer** — drag up or tap to see the full scene switch history with reasons

## Twitch Actions

The action buttons in `/deck` are boilerplate Server Actions in `apps/web/actions/`. To enable them add these to `apps/web/.env.local`:

```env
TWITCH_CLIENT_ID=your-client-id
TWITCH_TOKEN=your-user-oauth-token
TWITCH_CHANNEL_ID=your-broadcaster-id
```

Then uncomment the real API calls in each action file.

## OBS Configuration

Connect OBS via **Settings → OBS** in the dashboard. Per-stream-path rules control:

- Live and fallback scenes
- Trigger thresholds (bitrate, RTT, packet loss, health score)
- Trigger and recovery poll counts
- Per-source enable/disable rules based on stream state
