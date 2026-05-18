FROM oven/bun:1.3.12 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM oven/bun:1.3.12 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BACKEND_URL=http://api:8000
ENV BACKEND_URL=$BACKEND_URL
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM oven/bun:1.3.12 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3000/ || exit 1

CMD ["bun", "server.js"]
