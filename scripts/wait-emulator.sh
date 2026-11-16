#!/usr/bin/env bash
# エミュレーターのヘルスチェックが通るまで待つ
set -euo pipefail
EMULATOR_PORT="${EMULATOR_PORT:-9297}"
CA="$HOME/.aws/emulator/$EMULATOR_PORT/ca.pem"
for _ in $(seq 1 60); do
  if [ -f "$CA" ] && curl -fsS --cacert "$CA" "https://127.0.0.1:${EMULATOR_PORT}/__admin/health" >/dev/null 2>&1; then
    echo "AWS Emulator is ready"
    exit 0
  fi
  sleep 1
done
echo "AWS Emulator did not become ready" >&2
exit 1
