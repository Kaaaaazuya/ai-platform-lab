#!/usr/bin/env node
// lockfile に install スクリプトを持つパッケージが新しく入っていないかを確かめる（ADR-013）。
// .npmrc の ignore-scripts=true で実行はしないが、増えたら中身を見てからここに足す。
import { readFileSync } from "node:fs";

const ALLOWED = new Set([
  "node_modules/esbuild", // バイナリの確認だけ。optionalDependencies のバイナリで動く
  "node_modules/fsevents", // macOS 用。ビルド済みのバイナリが同梱されている
  "node_modules/protobufjs", // バージョン表示だけ
]);

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const found = Object.entries(lock.packages)
  .filter(([, p]) => p.hasInstallScript)
  .map(([name]) => name);
const unexpected = found.filter((n) => !ALLOWED.has(n));

if (unexpected.length > 0) {
  console.error("install スクリプトを持つパッケージが増えました。中身を確認してから許可リストに足してください:");
  for (const n of unexpected) console.error(`  - ${n}`);
  process.exit(1);
}
console.log(`ok: install scripts = ${found.length}（すべて許可済み）`);
