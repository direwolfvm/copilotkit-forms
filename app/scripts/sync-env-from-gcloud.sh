#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash ./scripts/sync-env-from-gcloud.sh --project <GCP_PROJECT_ID> [--out <PATH>] [--secret-prefix <PREFIX>]

Behavior:
  - Reads known environment variable values from Google Secret Manager.
  - Expects secret names to match env var names by default.
  - Updates (or appends) values in the target .env file.
  - Creates a timestamped backup when the target file already exists.

Examples:
  bash ./scripts/sync-env-from-gcloud.sh --project my-gcp-project
  bash ./scripts/sync-env-from-gcloud.sh --project my-gcp-project --out .env.local --secret-prefix dev-
USAGE
}

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Error: gcloud CLI is required."
  exit 2
fi

PROJECT_ID=""
OUT_FILE=".env"
SECRET_PREFIX=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --out)
      OUT_FILE="${2:-}"
      shift 2
      ;;
    --secret-prefix)
      SECRET_PREFIX="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument '$1'"
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Error: --project is required."
  usage
  exit 2
fi

VARS=(
  "VITE_COPILOTKIT_PUBLIC_API_KEY"
  "VITE_COPILOTKIT_RUNTIME_URL"
  "COPILOTKIT_CUSTOM_ADK_URL"
  "VITE_SUPABASE_URL"
  "VITE_SUPABASE_ANON_KEY"
  "VITE_PERMITFLOW_SUPABASE_URL"
  "VITE_PERMITFLOW_SUPABASE_ANON_KEY"
  "VITE_REVIEWWORKS_SUPABASE_URL"
  "VITE_REVIEWWORKS_SUPABASE_ANON_KEY"
)

touch "${OUT_FILE}"

if [[ -s "${OUT_FILE}" ]]; then
  backup="${OUT_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  cp "${OUT_FILE}" "${backup}"
  echo "Backed up existing ${OUT_FILE} to ${backup}"
fi

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  local escaped
  escaped="$(printf '%s' "${value}" | sed -e 's/[\/&]/\\&/g')"
  if rg -q "^${key}=" "${file}"; then
    sed -i '' -e "s/^${key}=.*/${key}=${escaped}/" "${file}"
  else
    printf "%s=%s\n" "${key}" "${value}" >> "${file}"
  fi
}

fetched=0
missing=0

for key in "${VARS[@]}"; do
  secret_name="${SECRET_PREFIX}${key}"
  if value="$(gcloud secrets versions access latest --secret="${secret_name}" --project="${PROJECT_ID}" 2>/dev/null)"; then
    # Remove CR if present and trim a single trailing newline.
    value="${value%$'\n'}"
    value="${value//$'\r'/}"
    upsert_env "${key}" "${value}" "${OUT_FILE}"
    fetched=$((fetched + 1))
    echo "Synced ${key} from secret ${secret_name}"
  else
    missing=$((missing + 1))
    echo "Skipped ${key}: secret ${secret_name} not found or inaccessible"
  fi
done

echo
echo "Done. Synced ${fetched} variables, skipped ${missing}. Output: ${OUT_FILE}"
