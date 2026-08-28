#!/usr/bin/env bash
# Local WebUI lifecycle controller for daily_stock_analysis.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PID_FILE="$PROJECT_DIR/.engine.pid"
LOG_FILE="$PROJECT_DIR/.engine.log"

# Project-specific configuration, verified from README.md and main.py.
SERVICE_KIND="web"
WEBUI_HOST="${ENGINE_WEBUI_HOST:-127.0.0.1}"
# Keep the local engine isolated from a pre-existing service that commonly
# occupies 8000 in this workstation. Override with ENGINE_WEBUI_PORT when a
# different binding is required.
WEBUI_PORT="${ENGINE_WEBUI_PORT:-8001}"
SETUP_COMMAND=("$PROJECT_DIR/.venv/bin/python" -m pip install -r "$PROJECT_DIR/requirements.txt")
START_COMMAND=("$PROJECT_DIR/.venv/bin/python" "$PROJECT_DIR/main.py" --webui-only --host "$WEBUI_HOST" --port "$WEBUI_PORT")
HEALTHCHECK_URL="http://${WEBUI_HOST}:${WEBUI_PORT}/api/health"
WEBUI_URL="http://${WEBUI_HOST}:${WEBUI_PORT}"

usage() {
    cat <<'EOF'
Usage: ./engine.sh {setup|start|stop|restart|status}

  setup    Create .venv, install Python dependencies, and build WebUI assets.
  start    Start the local WebUI in the background.
  stop     Stop only the process recorded by this project.
  restart  Stop then start the local WebUI.
  status   Show service state, IP, port, health URL, and log path.
EOF
}

is_running() {
    [[ -s "$PID_FILE" ]] && kill -0 "$(<"$PID_FILE")" 2>/dev/null
}

is_healthy() {
    curl --silent --fail --max-time 2 "$HEALTHCHECK_URL" >/dev/null 2>&1
}

listener_pid() {
    lsof -nP -t -iTCP:"$WEBUI_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

clear_stale_pid() {
    if [[ -e "$PID_FILE" ]] && ! is_running; then
        rm -f "$PID_FILE"
    fi
}

show_endpoint_info() {
    printf 'WebUI: %s [IP: %s, port: %s]\n' "$WEBUI_URL" "$WEBUI_HOST" "$WEBUI_PORT"
    printf 'Health: %s\n' "$HEALTHCHECK_URL"
}

setup() {
    command -v python3 >/dev/null || { echo 'python3 is required.' >&2; exit 1; }
    command -v npm >/dev/null || { echo 'npm is required to build the WebUI.' >&2; exit 1; }

    if [[ ! -x "$PROJECT_DIR/.venv/bin/python" ]]; then
        printf 'Creating virtual environment: %s\n' "$PROJECT_DIR/.venv"
        python3 -m venv "$PROJECT_DIR/.venv"
    fi

    "$PROJECT_DIR/.venv/bin/python" -m pip install --upgrade pip
    "${SETUP_COMMAND[@]}"
    (
        cd "$PROJECT_DIR/apps/dsa-web"
        npm ci
        npm run build
    )
    printf 'Setup complete. '
    show_endpoint_info
}

start() {
    if [[ ! -x "$PROJECT_DIR/.venv/bin/python" || ! -f "$PROJECT_DIR/static/index.html" ]]; then
        echo 'Dependencies or WebUI assets are missing; running setup first.'
        setup
    fi

    clear_stale_pid
    if is_running; then
        if is_healthy; then
            printf 'WebUI is already running (PID %s). ' "$(<"$PID_FILE")"
            show_endpoint_info
            return
        fi
        echo 'Recorded WebUI process is not healthy; stopping it before restart.' >&2
        stop
    fi

    local occupied_pid
    occupied_pid="$(listener_pid)"
    if [[ -n "$occupied_pid" ]]; then
        echo "WebUI port $WEBUI_PORT is already occupied by PID $occupied_pid; refusing to claim it." >&2
        exit 1
    fi

    (
        cd "$PROJECT_DIR"
        nohup "${START_COMMAND[@]}" >>"$LOG_FILE" 2>&1 &
        echo $! >"$PID_FILE"
    )
    # Importing the complete DSA FastAPI application can take longer than a
    # simple port probe on this local environment.  Success remains strictly
    # health-endpoint based, but allow enough time for that one-time startup.
    for _ in {1..150}; do
        if ! is_running; then
            break
        fi
        if is_healthy; then
            printf 'WebUI started (PID %s). ' "$(<"$PID_FILE")"
            show_endpoint_info
            return
        fi
        sleep 1
    done
    if is_running; then
        kill -TERM "$(<"$PID_FILE")" 2>/dev/null || true
    fi
    echo "WebUI failed its health check; inspect $LOG_FILE" >&2
    rm -f "$PID_FILE"
    exit 1
}

stop() {
    clear_stale_pid
    if ! is_running; then
        echo 'WebUI is not running.'
        return
    fi

    local pid
    pid="$(<"$PID_FILE")"
    kill -TERM "$pid"
    for _ in {1..30}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid"
    fi
    rm -f "$PID_FILE"
    for _ in {1..50}; do
        [[ -z "$(listener_pid)" ]] && break
        sleep 0.1
    done
    if [[ -n "$(listener_pid)" ]]; then
        echo "WebUI process stopped, but port $WEBUI_PORT is still occupied." >&2
        return 1
    fi
    echo 'WebUI stopped.'
}

restart() {
    stop
    start
}

status() {
    clear_stale_pid
    if is_running; then
        printf 'WebUI: running (PID %s). ' "$(<"$PID_FILE")"
    else
        printf 'WebUI: stopped. '
    fi
    show_endpoint_info
    printf 'Log: %s\n' "$LOG_FILE"
}

case "${1:-}" in
    setup) setup ;;
    start) start ;;
    stop) stop ;;
    restart) restart ;;
    status) status ;;
    -h|--help|help|'') usage ;;
    *) echo "Unknown command: $1" >&2; usage >&2; exit 2 ;;
esac
