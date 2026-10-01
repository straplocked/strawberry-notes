#syntax=docker/dockerfile:1

# --- deps ---------------------------------------------------------------
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# --- builder ------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js reads NEXT_TELEMETRY_DISABLED during build.
ENV NEXT_TELEMETRY_DISABLED=1
# next/font/google downloads the three app/layout.tsx fonts at build time.
# Next's own retry gives up within ~1s (3 tries, 100ms backoff), and GitHub-
# hosted runners occasionally lose Google's font CDN for longer than that.
# Retry the whole build with a real backoff — but only for that failure, so
# genuine build errors still fail on the first attempt.
RUN set -o pipefail; \
    for attempt in 1 2 3; do \
      npm run build 2>&1 | tee /tmp/build.log && exit 0; \
      grep -qE 'from Google Fonts|fonts\.(googleapis|gstatic)\.com' /tmp/build.log || exit 1; \
      [ "$attempt" -lt 3 ] || exit 1; \
      echo "Google Fonts fetch failed (attempt $attempt/3); retrying in $((attempt * 20))s" >&2; \
      sleep $((attempt * 20)); \
    done

# --- runner -------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && apk add --no-cache tini

# Copy standalone server output and static assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Drizzle assets needed to run migrations at container start.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Operator CLIs (`npm run user:create`, `user:reset`, `db:embed`) shell out
# to tsx. Bring tsx + its runtime deps into the runner so
# `docker compose exec app npm run …` works without a host toolchain.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# esbuild is a peer/optional dep at the top level (only materializes there
# if something else in the tree pins a matching version), so on Node 24 it
# resolves as tsx's own nested copy instead — copy it from there rather than
# assuming a top-level /app/node_modules/esbuild exists.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps
# bcryptjs is inlined into the Next.js standalone server bundle (it's small
# enough to escape the externals trace), so it isn't dropped at
# /app/node_modules/bcryptjs. The operator CLIs in scripts/ require it via the
# normal resolver, so copy it in explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
# Same situation for nodemailer — `lib/email/client.ts` is loaded by the
# operator CLIs (e.g. `user:reset`, which fires the passwordChanged
# notification through it). nodemailer ships with no production deps, so
# the package itself is the only copy needed.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/nodemailer ./node_modules/nodemailer
# Re-create the tsx bin symlink so it resolves sibling files via __dirname.
# A plain COPY of a symlink dereferences it on most builders, which breaks tsx.
RUN mkdir -p ./node_modules/.bin \
 && ln -sf ../tsx/dist/cli.mjs ./node_modules/.bin/tsx \
 && chown -h nextjs:nodejs ./node_modules/.bin/tsx

COPY --chown=nextjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Writable data dir for uploads.
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs
EXPOSE 3000
ENV UPLOAD_DIR=/data/uploads

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]

# --- aio (all-in-one: points at a shared external Postgres) --------------
# Identical runtime to `runner` above — same non-root user, same migrations,
# same uploads volume — with one difference: the entrypoint generates
# AUTH_SECRET into /data/.auth_secret on first boot instead of requiring the
# operator to set one up front. That's the whole point of an Unraid
# Community-Applications "one container, no shell commands" install.
# No supervisord: the app and the in-process embedding worker
# (lib/embeddings/worker.ts) both run inside the same `node server.js`
# process, so there's nothing else to supervise.
#
# Build with:
#   docker build -f docker/Dockerfile --target aio -t strawberry-notes:aio .
FROM runner AS aio
COPY --chown=nextjs:nodejs docker/aio/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
