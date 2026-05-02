#syntax=docker/dockerfile:1

# --- deps ---------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# --- builder ------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js reads NEXT_TELEMETRY_DISABLED during build.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner -------------------------------------------------------------
FROM node:20-alpine AS runner
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
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
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
