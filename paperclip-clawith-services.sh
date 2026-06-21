#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAPERCLIP_ROOT="${PAPERCLIP_ROOT:-$ROOT}"
CLAWITH_ROOT="${CLAWITH_ROOT:-$ROOT/todo/Clawith}"
VIRTUAL_CAMPUS_ROOT="${VIRTUAL_CAMPUS_ROOT:-$ROOT/virtual-campus}"
PAPERCLIP_SESSION="${PAPERCLIP_SESSION:-paperclip-clawith-paperclip}"
CLAWITH_FRONTEND_SESSION="${CLAWITH_FRONTEND_SESSION:-paperclip-clawith-frontend}"
VIRTUAL_CAMPUS_BFF_SESSION="${VIRTUAL_CAMPUS_BFF_SESSION:-paperclip-virtual-campus-bff}"
VIRTUAL_CAMPUS_UI_SESSION="${VIRTUAL_CAMPUS_UI_SESSION:-paperclip-virtual-campus-ui}"
CLAWITH_BACKEND_PORT="${CLAWITH_BACKEND_PORT:-8008}"
CLAWITH_FRONTEND_PORT="${CLAWITH_FRONTEND_PORT:-3008}"
VIRTUAL_CAMPUS_BFF_PORT="${VIRTUAL_CAMPUS_BFF_PORT:-4177}"
VIRTUAL_CAMPUS_UI_PORT="${VIRTUAL_CAMPUS_UI_PORT:-5177}"
PAPERCLIP_HEALTH_URL="${PAPERCLIP_HEALTH_URL:-http://localhost:3100/api/health}"
CLAWITH_FRONTEND_URL="${CLAWITH_FRONTEND_URL:-http://localhost:$CLAWITH_FRONTEND_PORT}"
CLAWITH_BASE_URL="${CLAWITH_BASE_URL:-http://localhost:$CLAWITH_BACKEND_PORT}"
CLAWITH_HEALTH_URL="${CLAWITH_HEALTH_URL:-$CLAWITH_BASE_URL/api/health}"
CLAWITH_BRIDGE_HEALTH_URL="${CLAWITH_BRIDGE_HEALTH_URL:-$CLAWITH_BASE_URL/api/bridge/health}"
VIRTUAL_CAMPUS_BFF_URL="${VIRTUAL_CAMPUS_BFF_URL:-http://127.0.0.1:$VIRTUAL_CAMPUS_BFF_PORT}"
VIRTUAL_CAMPUS_UI_URL="${VIRTUAL_CAMPUS_UI_URL:-http://127.0.0.1:$VIRTUAL_CAMPUS_UI_PORT}"
VIRTUAL_CAMPUS_HEALTH_URL="${VIRTUAL_CAMPUS_HEALTH_URL:-$VIRTUAL_CAMPUS_BFF_URL/api/health}"
VIRTUAL_CAMPUS_PAPERCLIP_API_BASE_URL="${VIRTUAL_CAMPUS_PAPERCLIP_API_BASE_URL:-http://127.0.0.1:3100}"
LLM_MODELS_URL="${LLM_MODELS_URL:-http://127.0.0.1:8080/v1/models}"
CLAWITH_SETUP_ARGS="${CLAWITH_SETUP_ARGS---dev}"
CLAWITH_RESTART_ARGS="${CLAWITH_RESTART_ARGS---source}"
CLAWITH_MANAGE_POSTGRES="${CLAWITH_MANAGE_POSTGRES:-true}"
CLAWITH_PG_CONTAINER="${CLAWITH_PG_CONTAINER:-paperclip-clawith-postgres}"
CLAWITH_PG_VOLUME="${CLAWITH_PG_VOLUME:-paperclip-clawith-pgdata}"
CLAWITH_MANAGED_DATABASE_URL="${CLAWITH_MANAGED_DATABASE_URL:-postgresql+asyncpg://clawith:clawith@localhost:5432/clawith?ssl=disable}"
CLAWITH_MANAGE_REDIS="${CLAWITH_MANAGE_REDIS:-true}"
CLAWITH_REDIS_CONTAINER="${CLAWITH_REDIS_CONTAINER:-paperclip-clawith-redis}"
CLAWITH_REDIS_VOLUME="${CLAWITH_REDIS_VOLUME:-paperclip-clawith-redisdata}"
CLAWITH_MANAGED_REDIS_URL="${CLAWITH_MANAGED_REDIS_URL:-redis://localhost:6379/0}"
SPLIT_ARGS=()

usage() {
  cat <<EOF
Usage: ./paperclip-clawith-services.sh <command> [target]

Commands:
  install   Install dependencies
  start     Start services
  stop      Stop services
  restart   Restart services
  status    Print service status

Targets:
  all             Paperclip + Clawith + Virtual Campus (default)
  paperclip       Paperclip only
  clawith         Clawith only
  virtual-campus  Virtual Campus only

Environment:
  PAPERCLIP_ROOT=$PAPERCLIP_ROOT
  CLAWITH_ROOT=$CLAWITH_ROOT
  VIRTUAL_CAMPUS_ROOT=$VIRTUAL_CAMPUS_ROOT
  PAPERCLIP_SESSION=$PAPERCLIP_SESSION
  CLAWITH_FRONTEND_SESSION=$CLAWITH_FRONTEND_SESSION
  VIRTUAL_CAMPUS_BFF_SESSION=$VIRTUAL_CAMPUS_BFF_SESSION
  VIRTUAL_CAMPUS_UI_SESSION=$VIRTUAL_CAMPUS_UI_SESSION
  CLAWITH_BACKEND_PORT=$CLAWITH_BACKEND_PORT
  CLAWITH_FRONTEND_PORT=$CLAWITH_FRONTEND_PORT
  VIRTUAL_CAMPUS_BFF_PORT=$VIRTUAL_CAMPUS_BFF_PORT
  VIRTUAL_CAMPUS_UI_PORT=$VIRTUAL_CAMPUS_UI_PORT
  CLAWITH_BASE_URL=$CLAWITH_BASE_URL
  VIRTUAL_CAMPUS_BFF_URL=$VIRTUAL_CAMPUS_BFF_URL
  VIRTUAL_CAMPUS_UI_URL=$VIRTUAL_CAMPUS_UI_URL
  VIRTUAL_CAMPUS_PAPERCLIP_API_BASE_URL=$VIRTUAL_CAMPUS_PAPERCLIP_API_BASE_URL
  CLAWITH_SETUP_ARGS="$CLAWITH_SETUP_ARGS"
  CLAWITH_RESTART_ARGS="$CLAWITH_RESTART_ARGS"
  CLAWITH_MANAGE_POSTGRES=$CLAWITH_MANAGE_POSTGRES
  CLAWITH_PG_CONTAINER=$CLAWITH_PG_CONTAINER
  CLAWITH_MANAGED_DATABASE_URL=$CLAWITH_MANAGED_DATABASE_URL
  CLAWITH_MANAGE_REDIS=$CLAWITH_MANAGE_REDIS
  CLAWITH_REDIS_CONTAINER=$CLAWITH_REDIS_CONTAINER
  CLAWITH_MANAGED_REDIS_URL=$CLAWITH_MANAGED_REDIS_URL
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

split_args() {
  local raw="$1"
  SPLIT_ARGS=()
  if [ -z "$raw" ]; then
    return 0
  fi
  # shellcheck disable=SC2206
  SPLIT_ARGS=($raw)
}

clawith_force_source() {
  local arg
  for arg in "${SPLIT_ARGS[@]}"; do
    [ "$arg" = "--source" ] && return 0
  done
  return 1
}

wait_health() {
  local name="$1" url="$2" tries="${3:-30}"
  if ! command -v curl >/dev/null 2>&1; then
    echo "$name: curl not found; skipped health check"
    return 0
  fi
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      echo "$name: ready ($url)"
      return 0
    fi
    sleep 1
  done
  echo "$name: not ready after ${tries}s ($url)"
  return 1
}

status_health() {
  local name="$1" url="$2"
  if command -v curl >/dev/null 2>&1 && curl -fsS -m 2 "$url" >/dev/null 2>&1; then
    echo "$name: ok ($url)"
  else
    echo "$name: not reachable ($url)"
  fi
}

clawith_database_url() {
  if [ -f "$CLAWITH_ROOT/.env" ]; then
    grep -E "^DATABASE_URL=" "$CLAWITH_ROOT/.env" | tail -1 | cut -d= -f2- || true
  fi
}

clawith_redis_url() {
  if [ -n "${REDIS_URL:-}" ]; then
    printf "%s\n" "$REDIS_URL"
    return
  fi
  if [ -f "$CLAWITH_ROOT/.env" ]; then
    grep -E "^REDIS_URL=" "$CLAWITH_ROOT/.env" | tail -1 | cut -d= -f2- || true
  fi
}

clawith_uses_external_db() {
  local db_url
  db_url="$(clawith_database_url)"
  [ -n "$db_url" ] || return 1
  case "$db_url" in
    *"@localhost:"*|*"@127.0.0.1:"*) return 1 ;;
    *) return 0 ;;
  esac
}

clawith_uses_external_redis() {
  local redis_url
  redis_url="$(clawith_redis_url)"
  [ -n "$redis_url" ] || return 1
  case "$redis_url" in
    *"@localhost:"*|*"@127.0.0.1:"*|*"//localhost:"*|*"//127.0.0.1:"*) return 1 ;;
    *) return 0 ;;
  esac
}

set_clawith_env_value() {
  local key="$1" value="$2" env_file="$CLAWITH_ROOT/.env"
  if [ ! -f "$env_file" ] && [ -f "$CLAWITH_ROOT/.env.example" ]; then
    cp "$CLAWITH_ROOT/.env.example" "$env_file"
  fi
  touch "$env_file"
  if grep -q "^$key=" "$env_file"; then
    sed -i "s|^$key=.*|$key=$value|" "$env_file"
  elif grep -q "^# $key=" "$env_file"; then
    sed -i "s|^# $key=.*|$key=$value|" "$env_file"
  else
    printf "%s=%s\n" "$key" "$value" >> "$env_file"
  fi
}

ensure_clawith_postgres() {
  [ "$CLAWITH_MANAGE_POSTGRES" = "true" ] || return 0
  clawith_uses_external_db && return 0
  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -p 5432 -q 2>/dev/null; then
    return 0
  fi
  require_cmd docker
  if docker ps --format "{{.Names}}" | grep -Fxq "$CLAWITH_PG_CONTAINER"; then
    echo "Clawith PostgreSQL already running: $CLAWITH_PG_CONTAINER"
  elif docker ps -a --format "{{.Names}}" | grep -Fxq "$CLAWITH_PG_CONTAINER"; then
    echo "Starting Clawith PostgreSQL container: $CLAWITH_PG_CONTAINER"
    docker start "$CLAWITH_PG_CONTAINER" >/dev/null
  else
    echo "Creating Clawith PostgreSQL container on localhost:5432..."
    docker run -d \
      --name "$CLAWITH_PG_CONTAINER" \
      -e POSTGRES_USER=clawith \
      -e POSTGRES_PASSWORD=clawith \
      -e POSTGRES_DB=clawith \
      -p 5432:5432 \
      -v "$CLAWITH_PG_VOLUME:/var/lib/postgresql/data" \
      postgres:15-alpine >/dev/null
  fi
  for _ in $(seq 1 30); do
    if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -p 5432 -q 2>/dev/null; then
      echo "Clawith PostgreSQL: ready (localhost:5432)"
      set_clawith_env_value "DATABASE_URL" "$CLAWITH_MANAGED_DATABASE_URL"
      return 0
    fi
    if docker exec "$CLAWITH_PG_CONTAINER" pg_isready -U clawith >/dev/null 2>&1; then
      echo "Clawith PostgreSQL: ready (container)"
      set_clawith_env_value "DATABASE_URL" "$CLAWITH_MANAGED_DATABASE_URL"
      return 0
    fi
    sleep 1
  done
  die "Clawith PostgreSQL did not become ready"
}

redis_ping_local() {
  command -v redis-cli >/dev/null 2>&1 || return 1
  redis-cli -h localhost -p 6379 ping 2>/dev/null | grep -Fxq PONG
}

ensure_clawith_redis() {
  [ "$CLAWITH_MANAGE_REDIS" = "true" ] || return 0
  clawith_uses_external_redis && return 0
  if redis_ping_local; then
    export REDIS_URL="$CLAWITH_MANAGED_REDIS_URL"
    return 0
  fi
  require_cmd docker
  if docker ps --format "{{.Names}}" | grep -Fxq "$CLAWITH_REDIS_CONTAINER"; then
    echo "Clawith Redis already running: $CLAWITH_REDIS_CONTAINER"
  elif docker ps -a --format "{{.Names}}" | grep -Fxq "$CLAWITH_REDIS_CONTAINER"; then
    echo "Starting Clawith Redis container: $CLAWITH_REDIS_CONTAINER"
    docker start "$CLAWITH_REDIS_CONTAINER" >/dev/null
  else
    echo "Creating Clawith Redis container on localhost:6379..."
    docker run -d \
      --name "$CLAWITH_REDIS_CONTAINER" \
      -p 6379:6379 \
      -v "$CLAWITH_REDIS_VOLUME:/data" \
      redis:7-alpine redis-server --appendonly yes >/dev/null
  fi
  for _ in $(seq 1 30); do
    if redis_ping_local; then
      echo "Clawith Redis: ready (localhost:6379)"
      export REDIS_URL="$CLAWITH_MANAGED_REDIS_URL"
      return 0
    fi
    if docker exec "$CLAWITH_REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -Fxq PONG; then
      echo "Clawith Redis: ready (container)"
      export REDIS_URL="$CLAWITH_MANAGED_REDIS_URL"
      return 0
    fi
    sleep 1
  done
  die "Clawith Redis did not become ready"
}

run_clawith_setup() {
  local sudo_dir rc
  sudo_dir="$(mktemp -d)"
  cat > "$sudo_dir/sudo" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$sudo_dir/sudo"
  if (
    cd "$CLAWITH_ROOT"
    PATH="$sudo_dir:$PATH" PGPASSWORD=clawith bash setup.sh "${SPLIT_ARGS[@]}"
  ); then
    rc=0
  else
    rc=$?
  fi
  rm -rf "$sudo_dir"
  return "$rc"
}

install_paperclip() {
  require_cmd pnpm
  [ -d "$PAPERCLIP_ROOT" ] || die "Paperclip root not found: $PAPERCLIP_ROOT"
  echo "Installing Paperclip dependencies..."
  (cd "$PAPERCLIP_ROOT" && pnpm install)
}

install_clawith() {
  [ -d "$CLAWITH_ROOT" ] || die "Clawith root not found: $CLAWITH_ROOT"
  [ -f "$CLAWITH_ROOT/setup.sh" ] || die "missing $CLAWITH_ROOT/setup.sh"
  split_args "$CLAWITH_SETUP_ARGS"
  ensure_clawith_postgres
  ensure_clawith_redis
  echo "Installing Clawith dependencies..."
  run_clawith_setup
}

install_virtual_campus() {
  require_cmd pnpm
  [ -d "$VIRTUAL_CAMPUS_ROOT" ] || die "Virtual Campus root not found: $VIRTUAL_CAMPUS_ROOT"
  echo "Installing Virtual Campus workspace dependencies..."
  (cd "$PAPERCLIP_ROOT" && pnpm install)
  echo "Building Virtual Campus..."
  (cd "$PAPERCLIP_ROOT" && pnpm --filter @paperclipai/virtual-campus build)
}

start_paperclip() {
  require_cmd pnpm
  require_cmd tmux
  [ -d "$PAPERCLIP_ROOT" ] || die "Paperclip root not found: $PAPERCLIP_ROOT"
  if tmux has-session -t "$PAPERCLIP_SESSION" 2>/dev/null; then
    echo "Paperclip tmux session already running: $PAPERCLIP_SESSION"
  else
    echo "Starting Paperclip in tmux session: $PAPERCLIP_SESSION"
    tmux new-session -d -s "$PAPERCLIP_SESSION" -c "$PAPERCLIP_ROOT" \
      "CLAWITH_BRIDGE_BASE_URL='$CLAWITH_BASE_URL' CLAWITH_BRIDGE_SECRET='${CLAWITH_BRIDGE_SECRET:-dev-secret}' pnpm dev"
  fi
  wait_health "Paperclip" "$PAPERCLIP_HEALTH_URL" 60 || true
}

stop_paperclip() {
  require_cmd pnpm
  echo "Stopping Paperclip dev runner..."
  (cd "$PAPERCLIP_ROOT" && pnpm dev:stop) || true
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$PAPERCLIP_SESSION" 2>/dev/null; then
    tmux kill-session -t "$PAPERCLIP_SESSION"
    echo "Killed Paperclip tmux session: $PAPERCLIP_SESSION"
  fi
}

restart_paperclip() {
  stop_paperclip
  start_paperclip
}

start_virtual_campus() {
  require_cmd pnpm
  require_cmd tmux
  [ -d "$VIRTUAL_CAMPUS_ROOT" ] || die "Virtual Campus root not found: $VIRTUAL_CAMPUS_ROOT"
  local log_dir="$VIRTUAL_CAMPUS_ROOT/.data/log"
  mkdir -p "$log_dir"
  if tmux has-session -t "$VIRTUAL_CAMPUS_BFF_SESSION" 2>/dev/null; then
    echo "Virtual Campus BFF tmux session already running: $VIRTUAL_CAMPUS_BFF_SESSION"
  else
    echo "Starting Virtual Campus BFF in tmux session: $VIRTUAL_CAMPUS_BFF_SESSION"
    tmux new-session -d -s "$VIRTUAL_CAMPUS_BFF_SESSION" -c "$PAPERCLIP_ROOT" \
      "PORT='$VIRTUAL_CAMPUS_BFF_PORT' PAPERCLIP_API_BASE_URL='$VIRTUAL_CAMPUS_PAPERCLIP_API_BASE_URL' pnpm --filter @paperclipai/virtual-campus dev:bff > '$log_dir/bff.log' 2>&1"
  fi
  if tmux has-session -t "$VIRTUAL_CAMPUS_UI_SESSION" 2>/dev/null; then
    echo "Virtual Campus UI tmux session already running: $VIRTUAL_CAMPUS_UI_SESSION"
  else
    echo "Starting Virtual Campus UI in tmux session: $VIRTUAL_CAMPUS_UI_SESSION"
    tmux new-session -d -s "$VIRTUAL_CAMPUS_UI_SESSION" -c "$PAPERCLIP_ROOT" \
      "VIRTUAL_CAMPUS_UI_PORT='$VIRTUAL_CAMPUS_UI_PORT' pnpm --filter @paperclipai/virtual-campus dev:ui -- --strictPort > '$log_dir/ui.log' 2>&1"
  fi
  wait_health "Virtual Campus BFF" "$VIRTUAL_CAMPUS_HEALTH_URL" 30 || true
  wait_health "Virtual Campus UI" "$VIRTUAL_CAMPUS_UI_URL" 30 || true
}

start_clawith_frontend() {
  require_cmd tmux
  local frontend_dir="$CLAWITH_ROOT/frontend"
  local log_dir="$CLAWITH_ROOT/.data/log"
  [ -d "$frontend_dir" ] || die "Clawith frontend root not found: $frontend_dir"
  [ -x "$frontend_dir/node_modules/.bin/vite" ] || die "missing $frontend_dir/node_modules/.bin/vite; run install first"
  mkdir -p "$log_dir"
  if tmux has-session -t "$CLAWITH_FRONTEND_SESSION" 2>/dev/null; then
    echo "Clawith frontend tmux session already running: $CLAWITH_FRONTEND_SESSION"
  else
    echo "Starting Clawith frontend in tmux session: $CLAWITH_FRONTEND_SESSION"
    tmux new-session -d -s "$CLAWITH_FRONTEND_SESSION" -c "$frontend_dir" \
      "env CI=true BACKEND_PORT=$CLAWITH_BACKEND_PORT node_modules/.bin/vite --host 0.0.0.0 --port $CLAWITH_FRONTEND_PORT --strictPort > '$log_dir/frontend.log' 2>&1"
  fi
  wait_health "Clawith frontend" "$CLAWITH_FRONTEND_URL" 30 || true
}

start_clawith() {
  [ -d "$CLAWITH_ROOT" ] || die "Clawith root not found: $CLAWITH_ROOT"
  [ -f "$CLAWITH_ROOT/restart.sh" ] || die "missing $CLAWITH_ROOT/restart.sh"
  split_args "$CLAWITH_RESTART_ARGS"
  if clawith_force_source; then
    stop_clawith_docker
  fi
  ensure_clawith_postgres
  ensure_clawith_redis
  echo "Starting Clawith..."
  if ! (cd "$CLAWITH_ROOT" && bash restart.sh "${SPLIT_ARGS[@]}"); then
    if wait_health "Clawith API" "$CLAWITH_HEALTH_URL" 60; then
      echo "Clawith backend is ready; continuing after restart.sh readiness timeout"
      start_clawith_frontend
    else
      echo "Clawith restart failed and backend health is not ready. See $CLAWITH_ROOT/.data/log/backend.log"
      return 1
    fi
  fi
  wait_health "Clawith API" "$CLAWITH_HEALTH_URL" 30 || true
  wait_health "Clawith frontend" "$CLAWITH_FRONTEND_URL" 30 || true
  wait_health "Clawith Bridge" "$CLAWITH_BRIDGE_HEALTH_URL" 10 || true
}

stop_pid_file() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 0
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -9 "$pid" 2>/dev/null || true
    echo "Stopped process $pid from $pid_file"
  fi
  rm -f "$pid_file"
}

stop_port_process() {
  local port="$1" name="$2" pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "$port/tcp" 2>/dev/null || true)"
  fi
  [ -n "$pids" ] || return 0
  echo "Stopping $name listener(s) on port $port: $pids"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
  for pid in $pids; do
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  done
}

stop_virtual_campus() {
  echo "Stopping Virtual Campus services..."
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$VIRTUAL_CAMPUS_BFF_SESSION" 2>/dev/null; then
    tmux kill-session -t "$VIRTUAL_CAMPUS_BFF_SESSION"
    echo "Killed Virtual Campus BFF tmux session: $VIRTUAL_CAMPUS_BFF_SESSION"
  fi
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$VIRTUAL_CAMPUS_UI_SESSION" 2>/dev/null; then
    tmux kill-session -t "$VIRTUAL_CAMPUS_UI_SESSION"
    echo "Killed Virtual Campus UI tmux session: $VIRTUAL_CAMPUS_UI_SESSION"
  fi
  stop_port_process "$VIRTUAL_CAMPUS_BFF_PORT" "Virtual Campus BFF"
  stop_port_process "$VIRTUAL_CAMPUS_UI_PORT" "Virtual Campus UI"
}

restart_virtual_campus() {
  stop_virtual_campus
  start_virtual_campus
}

clawith_docker_container_names() {
  command -v docker >/dev/null 2>&1 || return 0
  {
    docker ps --filter "label=com.docker.compose.project=clawith" --format "{{.Names}}" 2>/dev/null || true
    docker ps --format "{{.Names}}" 2>/dev/null | grep -E "^clawith-(frontend|backend|redis|postgres)-[0-9]+$" || true
  } | sort -u | awk -v managed="$CLAWITH_PG_CONTAINER" '$0 != managed'
}

stop_clawith_docker() {
  command -v docker >/dev/null 2>&1 || return 0
  local names
  names="$(clawith_docker_container_names | tr '\n' ' ')"
  [ -n "$names" ] || return 0
  local project_name
  project_name="clawith-$(basename "$(dirname "$CLAWITH_ROOT")")"
  echo "Stopping old Clawith Docker compose containers: $names"
  (cd "$CLAWITH_ROOT" && COMPOSE_PROJECT_NAME="$project_name" docker compose stop) || true
  (cd "$CLAWITH_ROOT" && docker compose stop) || true
  names="$(clawith_docker_container_names | tr '\n' ' ')"
  if [ -n "$names" ]; then
    docker stop $names >/dev/null 2>&1 || true
  fi
}

stop_clawith_postgres() {
  [ "$CLAWITH_MANAGE_POSTGRES" = "true" ] || return 0
  command -v docker >/dev/null 2>&1 || return 0
  if docker ps --format "{{.Names}}" | grep -Fxq "$CLAWITH_PG_CONTAINER"; then
    echo "Stopping managed Clawith PostgreSQL container: $CLAWITH_PG_CONTAINER"
    docker stop "$CLAWITH_PG_CONTAINER" >/dev/null || true
  fi
}

stop_clawith_redis() {
  [ "$CLAWITH_MANAGE_REDIS" = "true" ] || return 0
  command -v docker >/dev/null 2>&1 || return 0
  if docker ps --format "{{.Names}}" | grep -Fxq "$CLAWITH_REDIS_CONTAINER"; then
    echo "Stopping managed Clawith Redis container: $CLAWITH_REDIS_CONTAINER"
    docker stop "$CLAWITH_REDIS_CONTAINER" >/dev/null || true
  fi
}

stop_clawith() {
  local pid_dir="$CLAWITH_ROOT/.data/pid"
  echo "Stopping Clawith source services..."
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$CLAWITH_FRONTEND_SESSION" 2>/dev/null; then
    tmux kill-session -t "$CLAWITH_FRONTEND_SESSION"
    echo "Killed Clawith frontend tmux session: $CLAWITH_FRONTEND_SESSION"
  fi
  stop_pid_file "$pid_dir/frontend.pid"
  stop_pid_file "$pid_dir/backend.pid"
  stop_port_process "$CLAWITH_FRONTEND_PORT" "Clawith frontend"
  stop_port_process "$CLAWITH_BACKEND_PORT" "Clawith backend"
  stop_clawith_docker
  stop_clawith_postgres
  stop_clawith_redis
}

restart_clawith() {
  stop_clawith
  start_clawith
}

status_paperclip() {
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$PAPERCLIP_SESSION" 2>/dev/null; then
    echo "Paperclip tmux: running ($PAPERCLIP_SESSION)"
  else
    echo "Paperclip tmux: not running"
  fi
  status_health "Paperclip" "$PAPERCLIP_HEALTH_URL"
}

status_virtual_campus() {
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$VIRTUAL_CAMPUS_BFF_SESSION" 2>/dev/null; then
    echo "Virtual Campus BFF tmux: running ($VIRTUAL_CAMPUS_BFF_SESSION)"
  else
    echo "Virtual Campus BFF tmux: not running"
  fi
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$VIRTUAL_CAMPUS_UI_SESSION" 2>/dev/null; then
    echo "Virtual Campus UI tmux: running ($VIRTUAL_CAMPUS_UI_SESSION)"
  else
    echo "Virtual Campus UI tmux: not running"
  fi
  status_health "Virtual Campus BFF" "$VIRTUAL_CAMPUS_HEALTH_URL"
  status_health "Virtual Campus UI" "$VIRTUAL_CAMPUS_UI_URL"
}

status_clawith() {
  local pid_dir="$CLAWITH_ROOT/.data/pid"
  for name in backend frontend; do
    local pid_file="$pid_dir/$name.pid"
    if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      echo "Clawith $name: running ($(cat "$pid_file"))"
    elif [ "$name" = "backend" ] && command -v curl >/dev/null 2>&1 && curl -fsS -m 2 "$CLAWITH_HEALTH_URL" >/dev/null 2>&1; then
      echo "Clawith $name: reachable (pid not tracked)"
    elif [ "$name" = "frontend" ] && command -v curl >/dev/null 2>&1 && curl -fsS -m 2 "$CLAWITH_FRONTEND_URL" >/dev/null 2>&1; then
      echo "Clawith $name: reachable (pid not tracked)"
    else
      echo "Clawith $name: not running"
    fi
  done
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$CLAWITH_FRONTEND_SESSION" 2>/dev/null; then
    echo "Clawith frontend tmux: running ($CLAWITH_FRONTEND_SESSION)"
  elif command -v curl >/dev/null 2>&1 && curl -fsS -m 2 "$CLAWITH_FRONTEND_URL" >/dev/null 2>&1; then
    echo "Clawith frontend tmux: not used (frontend already reachable)"
  else
    echo "Clawith frontend tmux: not running"
  fi
  if command -v docker >/dev/null 2>&1 && docker ps --format "{{.Names}}" | grep -Fxq "$CLAWITH_PG_CONTAINER"; then
    echo "Clawith PostgreSQL: running ($CLAWITH_PG_CONTAINER)"
  elif command -v docker >/dev/null 2>&1 && docker ps -a --format "{{.Names}}" | grep -Fxq "$CLAWITH_PG_CONTAINER"; then
    echo "Clawith PostgreSQL: stopped ($CLAWITH_PG_CONTAINER)"
  else
    echo "Clawith PostgreSQL: not managed by this script"
  fi
  if redis_ping_local; then
    echo "Clawith Redis: running (localhost:6379)"
  elif command -v docker >/dev/null 2>&1 && docker ps --format "{{.Names}}" | grep -Fxq "$CLAWITH_REDIS_CONTAINER"; then
    echo "Clawith Redis: running ($CLAWITH_REDIS_CONTAINER)"
  elif command -v docker >/dev/null 2>&1 && docker ps -a --format "{{.Names}}" | grep -Fxq "$CLAWITH_REDIS_CONTAINER"; then
    echo "Clawith Redis: stopped ($CLAWITH_REDIS_CONTAINER)"
  else
    echo "Clawith Redis: not managed by this script"
  fi
  local docker_names
  docker_names="$(clawith_docker_container_names | tr '\n' ' ')"
  if [ -n "$docker_names" ]; then
    echo "Clawith Docker compose: running ($docker_names)"
  else
    echo "Clawith Docker compose: not running"
  fi
  status_health "Clawith frontend" "$CLAWITH_FRONTEND_URL"
  status_health "Clawith API" "$CLAWITH_HEALTH_URL"
  status_health "Clawith Bridge" "$CLAWITH_BRIDGE_HEALTH_URL"
  status_health "LLM API" "$LLM_MODELS_URL"
}

run_for_target() {
  local command="$1" target="$2"
  case "$target" in
    all)
      case "$command" in
        install) install_paperclip; install_clawith; install_virtual_campus ;;
        start) start_paperclip; start_clawith; start_virtual_campus ;;
        stop) stop_virtual_campus; stop_paperclip; stop_clawith ;;
        restart) stop_virtual_campus; stop_paperclip; stop_clawith; start_paperclip; start_clawith; start_virtual_campus ;;
        status) status_clawith; status_paperclip; status_virtual_campus ;;
      esac
      ;;
    paperclip) "${command}_paperclip" ;;
    clawith) "${command}_clawith" ;;
    virtual-campus) "${command}_virtual_campus" ;;
    *) die "unknown target: $target" ;;
  esac
}

main() {
  local command="${1:-}" target="${2:-all}"
  case "$command" in
    install|start|stop|restart|status) run_for_target "$command" "$target" ;;
    -h|--help|help|"") usage ;;
    *) usage; die "unknown command: $command" ;;
  esac
}

main "$@"
