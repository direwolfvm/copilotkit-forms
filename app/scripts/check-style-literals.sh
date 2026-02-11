#!/usr/bin/env bash
set -euo pipefail

if ! command -v rg >/dev/null 2>&1; then
  echo "Error: rg (ripgrep) is required for check:style-tokens."
  exit 2
fi

css_glob="src/*.css"
token_file="src/styles/tokens.css"

hex_hits="$(rg -n "#[0-9a-fA-F]{3,8}" ${css_glob} -g "!${token_file}" || true)"
rgb_hits="$(rg -n "rgba?\\([^\\)]*\\)" ${css_glob} -g "!${token_file}" || true)"

if [[ -n "${hex_hits}" || -n "${rgb_hits}" ]]; then
  echo "Found raw color literals outside ${token_file}."
  if [[ -n "${hex_hits}" ]]; then
    echo
    echo "Hex literals:"
    echo "${hex_hits}"
  fi
  if [[ -n "${rgb_hits}" ]]; then
    echo
    echo "RGB/RGBA literals:"
    echo "${rgb_hits}"
  fi
  echo
  echo "Use semantic tokens from ${token_file} instead."
  exit 1
fi

echo "No raw hex or rgb/rgba literals found outside ${token_file}."
