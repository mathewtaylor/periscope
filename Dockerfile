ARG BUN_VERSION=1.2.23

# ---------- builder ----------
FROM oven/bun:${BUN_VERSION} AS builder
WORKDIR /app

# Commit SHA from CI (or `--build-arg GIT_COMMIT=...` locally). Forwarded
# into the Vite build via ENV so the SPA bundle carries the correct hash;
# the .git directory is intentionally not copied into the build context.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY server ./server

COPY web/package.json ./web/package.json
RUN cd web && bun install --frozen-lockfile
COPY web ./web
RUN cd web && bun run build

# ---------- runtime ----------
FROM oven/bun:${BUN_VERSION}-alpine AS runtime
WORKDIR /app

ENV PORT=5050 \
    DB_PATH=/data/events.db \
    WEB_DIST=/app/web/dist \
    NODE_ENV=production

RUN apk add --no-cache curl \
 && addgroup -S periscope \
 && adduser -S -G periscope periscope \
 && mkdir -p /data \
 && chown -R periscope:periscope /data

COPY --from=builder --chown=periscope:periscope /app/node_modules ./node_modules
COPY --from=builder --chown=periscope:periscope /app/server ./server
COPY --from=builder --chown=periscope:periscope /app/web/dist ./web/dist
COPY --from=builder --chown=periscope:periscope /app/package.json ./package.json
COPY --from=builder --chown=periscope:periscope /app/tsconfig.json ./tsconfig.json

USER periscope

EXPOSE 5050
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:5050/health || exit 1

CMD ["bun", "run", "server/index.ts"]
