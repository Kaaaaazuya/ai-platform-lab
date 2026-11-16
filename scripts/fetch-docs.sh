#!/usr/bin/env bash
# RAGの題材: OpenTelemetry 公式ドキュメントの concepts（CC BY 4.0）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/data/docs/opentelemetry"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/open-telemetry/opentelemetry.io.git "$TMP/otel"
git -C "$TMP/otel" sparse-checkout set content/en/docs/concepts

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$TMP/otel/content/en/docs/concepts/." "$DEST/"
echo "fetched $(find "$DEST" -name '*.md' | wc -l | tr -d ' ') files into $DEST"
