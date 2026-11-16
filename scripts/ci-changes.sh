#!/usr/bin/env bash
# CIで、変更されたファイルからどのジョブを動かすかを決める（ADR-013）。
# 使い方: scripts/ci-changes.sh <比べる元のコミット>
#   元のコミットが空・全部0・見つからない場合や、CIの設定自体が変わった場合は、すべてを動かす。
# 結果は key=true|false の行で出す（GitHub Actions では $GITHUB_OUTPUT に追記する）。
set -euo pipefail

base="${1:-}"
keys=(node docs terraform shell workflows docker)
declare -A run

set_all() {
  for k in "${keys[@]}"; do run[$k]=$1; done
}

emit() {
  for k in "${keys[@]}"; do echo "$k=${run[$k]}"; done
}

set_all false

if [[ -z "$base" || "$base" =~ ^0+$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "比べる元のコミットがないので、すべてのジョブを動かします" >&2
  set_all true
  emit
  exit 0
fi

echo "変更されたファイル:" >&2

# --no-renames: 移動したファイルは元と先の両方の名前で判定する
# -z: 日本語などのファイル名をそのまま扱う（Git の表示用の引用符を付けない）
while IFS= read -r -d '' f; do
  [[ -z "$f" ]] && continue
  echo "  $f" >&2
  case "$f" in
    .github/workflows/ci.yml | scripts/ci-changes.sh)
      set_all true
      break
      ;;
  esac
  case "$f" in
    app/* | eval/* | package.json | package-lock.json | .npmrc | biome.json | scripts/check-install-scripts.mjs)
      run[node]=true
      ;;
  esac
  case "$f" in
    docs/* | README.md | mkdocs.yml | .textlintrc.json | prh.yml | package.json | package-lock.json)
      run[docs]=true
      ;;
  esac
  case "$f" in
    terraform/* | .tflint.hcl | scripts/emulator-env.sh | scripts/wait-emulator.sh)
      run[terraform]=true
      ;;
  esac
  case "$f" in
    *.sh) run[shell]=true ;;
  esac
  case "$f" in
    .github/workflows/*) run[workflows]=true ;;
  esac
  case "$f" in
    */Dockerfile | Dockerfile) run[docker]=true ;;
  esac
done < <(git diff --name-only --no-renames -z "$base" HEAD)

emit
