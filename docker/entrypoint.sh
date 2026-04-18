#!/bin/sh
set -eu

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

wait_for_db

echo "[strawberry] running migrations"
node_modules/.bin/drizzle-kit migrate || {
  echo "[strawberry] migration failed"
  exit 1
}

exec "$@"
