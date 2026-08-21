#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v flock >/dev/null || {
  echo "install-ci.sh requires Linux flock." >&2
  exit 69
}
command -v timeout >/dev/null || {
  echo "install-ci.sh requires GNU timeout." >&2
  exit 69
}

lock_file="${SITES_PROJECT_ROOT}/.sites-runtime/install.lock"
exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "Another dependency install is already running for ${SITES_PROJECT_ROOT}." >&2
  exit 75
fi

echo "Installing the integrity-pinned dependency graph..."
export NPM_CONFIG_MAXSOCKETS=2
export NPM_CONFIG_FETCH_RETRIES=1
export NPM_CONFIG_FETCH_TIMEOUT=60000
timeout \
  --signal=TERM \
  --kill-after="${SITES_INSTALL_KILL_AFTER:-15s}" \
  "${SITES_INSTALL_TIMEOUT:-8m}" \
  npm ci --cache "${SITES_PROJECT_ROOT}/.sites-runtime/npm-cache"

for executable in vite tsc eslint wrangler; do
  if [[ ! -x "${SITES_PROJECT_ROOT}/node_modules/.bin/${executable}" ]]; then
    echo "npm ci completed without the required ${executable} executable." >&2
    exit 69
  fi
done

echo "Locked dependency installation passed."
