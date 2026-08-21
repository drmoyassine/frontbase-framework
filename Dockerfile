# syntax=docker/dockerfile:1
# Backendless single-container self-host of the FULL CMS — the same Hono engine
# the Cloudflare Worker runs (src/node.ts entry), no sidecar services.
#
# Build context is the REPO ROOT (pnpm workspace):
#   docker compose build        (from examples/cf-full — compose sets the context)
#   docker build -f examples/cf-full/Dockerfile .   (from the repo root)
#
# Prerequisite: `pnpm run fetch:console` already staged console-dist/ bundles +
# public/react/hydrate.vendor.js (untracked, posture B). scripts/docker-gate.mjs
# fails the build fast with the remedy if not.

# ---- build: full workspace, all packages compiled ---------------------------
FROM node:22-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY . .
RUN node scripts/docker-gate.mjs
RUN pnpm install --frozen-lockfile
# -r runs every workspace package's build (root excluded by default), including
# examples/cf-full's build.mjs → dist/node.mjs + the patched console-dist/react.
RUN pnpm -r build

# ---- runtime: prod deps + built artifacts, non-root -------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 APP_DB_URL=file:/data/app.db
RUN corepack enable && mkdir -p /data && chown node:node /data
WORKDIR /app
# Fresh prod-only install (deterministic from the lockfile). pnpm deploy is NOT
# used: cf-full has no `files` field, so npm-packing it would strip dist/ and
# the console payload via the .gitignore fallback.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY examples/cf-full/package.json ./examples/cf-full/package.json
RUN pnpm install --prod --frozen-lockfile
# COPY merges rather than replaces — the prod node_modules laid down above
# survive; these layers bring the compiled dist + console payload.
COPY --from=build /app/packages ./packages
COPY --from=build /app/examples/cf-full ./examples/cf-full
RUN test -f examples/cf-full/dist/node.mjs && test -f examples/cf-full/console-dist/react/hydrate.js \
    || { echo "✗ build artifacts incomplete (node.mjs / patched hydrate.js missing)"; exit 1; }
USER node
WORKDIR /app/examples/cf-full
EXPOSE 8787
VOLUME /data
# GET /health executes a real SELECT 1 against the app database — a genuine
# liveness+readiness probe. (NOT /api/queue/health: unhealthy-by-design.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/node.mjs"]
