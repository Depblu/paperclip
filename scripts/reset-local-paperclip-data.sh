#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/reset-local-paperclip-data.sh [options]

Options:
  --yes              Run without interactive confirmation.
  --dry-run          Print what would be deleted, but do not delete anything.
  --all-local-data   Also delete local storage, backups, secrets, logs, agent
                    workspaces, project workspaces, and per-company adapter homes.
                    Config files are kept.
  --home PATH        Paperclip home. Defaults to PAPERCLIP_HOME or ~/.paperclip.
  --instance ID      Paperclip instance id. Defaults to PAPERCLIP_INSTANCE_ID or default.
  -h, --help         Show this help.

Examples:
  pnpm db:reset:local --dry-run
  pnpm db:reset:local --yes
  pnpm db:reset:local --all-local-data --yes

This script only resets embedded PostgreSQL data. It refuses to run when
DATABASE_URL is set, because external databases need their own operator process.
Stop Paperclip first with `pnpm dev:stop` before deleting a live local DB.
EOF
}

fail() {
  echo "error: $*" >&2
  exit 1
}

expand_path() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

yes=0
dry_run=0
all_local_data=0
paperclip_home="${PAPERCLIP_HOME:-$HOME/.paperclip}"
instance_id="${PAPERCLIP_INSTANCE_ID:-default}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --yes)
      yes=1
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --all-local-data)
      all_local_data=1
      shift
      ;;
    --home)
      [[ $# -ge 2 ]] || fail "--home requires a path"
      paperclip_home="$2"
      shift 2
      ;;
    --instance)
      [[ $# -ge 2 ]] || fail "--instance requires an id"
      instance_id="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

if [[ -n "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is set; refusing to reset an external database"
fi

if [[ ! "$instance_id" =~ ^[A-Za-z0-9_-]+$ ]]; then
  fail "unsafe instance id: $instance_id"
fi

paperclip_home="$(expand_path "$paperclip_home")"
paperclip_home="$(realpath -m "$paperclip_home")"
instance_root="$(realpath -m "$paperclip_home/instances/$instance_id")"
db_dir="$(realpath -m "$instance_root/db")"

[[ "$paperclip_home" = /* ]] || fail "paperclip home must resolve to an absolute path"
[[ "$instance_root" = "$paperclip_home/instances/$instance_id" ]] || fail "unsafe instance root"
[[ "$db_dir" = "$instance_root/db" ]] || fail "unsafe database path"
[[ "$db_dir" != "/" ]] || fail "refusing to delete /"

targets=("$db_dir")

if [[ "$all_local_data" -eq 1 ]]; then
  targets+=(
    "$instance_root/data/storage"
    "$instance_root/data/backups"
    "$instance_root/secrets"
    "$instance_root/workspaces"
    "$instance_root/projects"
    "$instance_root/companies"
    "$instance_root/codex-home"
    "$instance_root/logs"
  )
fi

existing_targets=()
for target in "${targets[@]}"; do
  target="$(realpath -m "$target")"
  case "$target" in
    "$instance_root/db"|"$instance_root/data/storage"|"$instance_root/data/backups"|"$instance_root/secrets"|"$instance_root/workspaces"|"$instance_root/projects"|"$instance_root/companies"|"$instance_root/codex-home"|"$instance_root/logs")
      ;;
    *)
      fail "unsafe delete target: $target"
      ;;
  esac
  if [[ -e "$target" ]]; then
    existing_targets+=("$target")
  fi
done

echo "Paperclip instance: $instance_id"
echo "Instance root:      $instance_root"
echo

if [[ "${#existing_targets[@]}" -eq 0 ]]; then
  echo "Nothing to delete."
  exit 0
fi

if [[ "$dry_run" -eq 0 && -d "$db_dir" ]]; then
  pid_file="$(find "$db_dir" -name postmaster.pid -print -quit 2>/dev/null || true)"
  if [[ -n "$pid_file" ]]; then
    fail "found PostgreSQL pid file at $pid_file; run pnpm dev:stop first"
  fi
fi

if [[ "$all_local_data" -eq 1 ]]; then
  echo "Mode: database plus local runtime data"
else
  echo "Mode: database only"
fi
echo "Targets:"
for target in "${existing_targets[@]}"; do
  echo "  - $target"
done
echo

if [[ "$dry_run" -eq 1 ]]; then
  echo "Dry run only. No files were deleted."
  exit 0
fi

if [[ "$yes" -ne 1 ]]; then
  read -r -p "Type RESET to delete these paths: " confirmation
  [[ "$confirmation" == "RESET" ]] || fail "confirmation did not match RESET"
fi

for target in "${existing_targets[@]}"; do
  rm -rf -- "$target"
done

echo "Deleted ${#existing_targets[@]} path(s)."
echo "Start Paperclip again to recreate the embedded database and run migrations:"
echo "  pnpm dev"
