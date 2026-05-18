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

- [Docker](https://docker.com) + Docker Compose
- OBS with [obs-websocket](https://obsproject.com/forum/resources/obs-websocket-remote-control-obs-studio-from-websockets.466/) v5
- A [Supabase](https://supabase.com) project
- [Traefik](https://traefik.io) reverse proxy with an external `traefik` Docker network and a `letsencrypt` cert resolver

### 1. Clone

```bash
git clone https://github.com/jochemwhite/irl-stream-setup.git
cd irl-stream-setup
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MediaMTX (internal — resolved by Docker container name)
MEDIAMTX_METRICS=http://mediamtx:9998/metrics
SRT_PUBLISH_PASSPHRASE=your-srt-passphrase
WEBRTC_ADDITIONAL_HOST=your-server-lan-ip

# API
PORT=8000
POLL_INTERVAL=1000
```

### 3. Run the Supabase migration

Apply the schema to your Supabase project:

```bash
# Using the Supabase CLI
supabase db push

# Or paste supabase-obs-migration.sql into the Supabase SQL editor
```

### 4. Deploy

```bash
docker compose up -d --build
```

The dashboard will be available at `https://dashboard.xpudu.com` and the Stream Deck at `https://dashboard.xpudu.com/deck`. Traefik provisions TLS certificates automatically via Let's Encrypt.

### Development

```bash
# Install dependencies
bun install

# API
cd apps/api && bun run src/index.ts

# Web (separate terminal)
cd apps/web && bun dev
```

For local dev, create `apps/web/.env.local`:

```env
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

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
