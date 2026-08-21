#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
configuration="${project_root}/wrangler.jsonc"
wrangler="${project_root}/node_modules/.bin/wrangler"
mode="${1:-}"

case "${mode}" in
  dry-run|preview|production) ;;
  *)
    echo "usage: scripts/cloudflare-deploy.sh <dry-run|preview|production>" >&2
    exit 64
    ;;
esac

if [[ ! -x "${wrangler}" ]]; then
  echo "Wrangler is unavailable. Run npm ci before deployment." >&2
  exit 69
fi
if [[ ! -f "${project_root}/dist/client/index.html" ]]; then
  echo "The static production build is absent. Run npm run build before deployment." >&2
  exit 66
fi

if [[ "${mode}" == "production" ]]; then
  node "${script_dir}/validate-cloudflare-build.mjs" --production-origin
else
  node "${script_dir}/validate-cloudflare-build.mjs"
fi

export CI="${CI:-1}"
export WRANGLER_HIDE_BANNER=true
export WRANGLER_SEND_METRICS=false
export WRANGLER_WRITE_LOGS=false

case "${mode}" in
  dry-run)
    exec "${wrangler}" deploy --config "${configuration}" --autoconfig=false --dry-run --strict --outdir "${project_root}/dist/wrangler-dry-run"
    ;;
  preview)
    exec "${wrangler}" versions upload --config "${configuration}"
    ;;
  production)
    exec "${wrangler}" deploy --config "${configuration}" --autoconfig=false --strict
    ;;
esac
