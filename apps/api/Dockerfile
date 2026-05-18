FROM oven/bun:1.1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

RUN addgroup --system --gid 1001 monitoring && \
    adduser --system --uid 1001 monitoring
USER monitoring

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
