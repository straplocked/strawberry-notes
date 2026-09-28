#!/bin/sh
set -eu

log() { echo "[strawberry-aio] $*"; }

# ─── Secrets: generate AUTH_SECRET once into /data, reused on restart ──────
# Unraid's Community Applications flow has no "generate a secret for me"
# step — the operator would otherwise have to shell in and run
# `openssl rand -base64 32` by hand before first boot. Do it here instead:
# zero-config on first run, stable across restarts (same file, same value).
if [ -z "${AUTH_SECRET:-}" ]; then
  SECRET_FILE="/data/.auth_secret"

  if [ ! -f "$SECRET_FILE" ]; then
    # Fail loudly rather than generating a secret that vanishes on restart
    # (which would silently log every session out on every recreate).
    if ! ( : > "/data/.write_test" ) 2>/dev/null; then
      log "ERROR: /data is not writable — cannot generate AUTH_SECRET."
      log "Mount a writable volume at /data, or set AUTH_SECRET yourself."
      exit 1
    fi
    rm -f "/data/.write_test"

    log "AUTH_SECRET not set — generating one into ${SECRET_FILE} (first boot only)"
    umask 077
    tmp=$(mktemp "${SECRET_FILE}.XXXXXX")
    # `node` is always present (it's the runtime); avoid adding an openssl
    # package to the image just for this one random value.
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" > "$tmp"
    chmod 600 "$tmp"
    # Atomic on the same filesystem — no reader ever sees a half-written file.
    mv -f "$tmp" "$SECRET_FILE"
  fi

  AUTH_SECRET=$(cat "$SECRET_FILE")
  export AUTH_SECRET
  log "using generated AUTH_SECRET from ${SECRET_FILE}"
fi

# ─── Wait for Postgres, then migrate ───────────────────────────────────────
# Same approach as docker/entrypoint.sh: parse DATABASE_URL rather than
# requiring pg_isready so the image doesn't need a postgres client.
wait_for_db() {
  if [ -z "${DATABASE_URL:-}" ]; then
    log "DATABASE_URL is not set"
    exit 1
  fi
  host_port=$(echo "$DATABASE_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/?]+).*#\2#')
  host=$(echo "$host_port" | cut -d: -f1)
  port=$(echo "$host_port" | cut -d: -f2)
  port=${port:-5432}

  log "waiting for database at ${host}:${port}"
  i=0
  while ! nc -z "$host" "$port" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      log "database did not become reachable"
      exit 1
    fi
    sleep 1
  done
  log "database reachable"
}

wait_for_db

log "running database migrations"
node node_modules/drizzle-kit/bin.cjs migrate || {
  log "migration failed"
  exit 1
}

# Single process: the app and the in-process embedding worker
# (lib/embeddings/worker.ts) both live inside the same Next.js server — no
# separate worker binary, so no supervisord needed.
log "starting app"
exec "$@"
