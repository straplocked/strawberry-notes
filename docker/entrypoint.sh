#!/bin/sh
set -eu

# ─── Secrets: generate AUTH_SECRET once into /data, reused on restart ──────
# Zero-config first run: `docker compose up` with no `.env` at all should
# still boot. Without an operator-supplied AUTH_SECRET, generate one here on
# first boot and persist it to the uploads volume so it survives container
# recreates (rotating it would silently log everyone out). Reused on every
# subsequent boot by reading the same file back.
ensure_auth_secret() {
  if [ -n "${AUTH_SECRET:-}" ]; then
    return 0
  fi

  secret_file="/data/.auth_secret"

  if [ ! -f "$secret_file" ]; then
    # Fail loudly rather than generating a secret that vanishes on restart.
    if ! ( : > "/data/.write_test" ) 2>/dev/null; then
      echo "[strawberry] ERROR: AUTH_SECRET is not set and /data is not writable." >&2
      echo "[strawberry] Mount a writable volume at /data, or set AUTH_SECRET yourself." >&2
      exit 1
    fi
    rm -f "/data/.write_test"

    echo "[strawberry] AUTH_SECRET not set — generating one into ${secret_file} (first boot only)"
    umask 077
    tmp=$(mktemp "${secret_file}.XXXXXX")
    # `node` is always present (it's the runtime); avoid adding an openssl
    # package to the image just for this one random value.
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" > "$tmp"
    chmod 600 "$tmp"
    # Atomic on the same filesystem — no reader ever sees a half-written file.
    mv -f "$tmp" "$secret_file"
  fi

  AUTH_SECRET=$(cat "$secret_file")
  export AUTH_SECRET
  echo "[strawberry] using generated AUTH_SECRET from ${secret_file}"
}

# Wait for Postgres before running migrations. We parse DATABASE_URL rather
# than requiring pg_isready so we don't ship a postgres client in the image.
wait_for_db() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[strawberry] DATABASE_URL is not set"
    exit 1
  fi
  # Strip scheme + userinfo to get host:port.
  host_port=$(echo "$DATABASE_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/?]+).*#\2#')
  host=$(echo "$host_port" | cut -d: -f1)
  port=$(echo "$host_port" | cut -d: -f2)
  port=${port:-5432}

  echo "[strawberry] waiting for database at ${host}:${port}"
  i=0
  while ! nc -z "$host" "$port" 2>/dev/null; do
    i=$((i+1))
    if [ "$i" -gt 60 ]; then
      echo "[strawberry] database did not become reachable"
      exit 1
    fi
    sleep 1
  done
  echo "[strawberry] database reachable"
}

ensure_auth_secret
wait_for_db

echo "[strawberry] running migrations"
node node_modules/drizzle-kit/bin.cjs migrate || {
  echo "[strawberry] migration failed"
  exit 1
}

exec "$@"
