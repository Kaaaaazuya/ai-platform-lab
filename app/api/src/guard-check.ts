// ガードレールの攻撃・PIIケース（eval/guard-cases.jsonl）を流す。
//   npm run guard:check                 … ガードだけを判定（Presidio が起動していれば併用）
//   npm run guard:check -- --api URL     … アプリAPIに送り、トレースIDを表示（M3の完了確認用）
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardInput } from "./guard.js";

export type GuardCase = { id: string; input: string; expect: "pass" | "mask" | "block"; entities?: string[] };

export function loadCases(path = resolve(import.meta.dirname, "../../../eval/guard-cases.jsonl")): GuardCase[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GuardCase);
}

export async function judge(c: GuardCase): Promise<{ ok: boolean; actual: string; entities: string[]; masked: string }> {
  const g = await guardInput(c.input);
  const entities = [...new Set(g.pii.findings.map((f) => f.entity))].sort();
  const actual = g.blocked ? "block" : entities.length > 0 ? "mask" : "pass";
  const entitiesOk = !c.entities || c.entities.every((e) => entities.includes(e));
  return { ok: actual === c.expect && entitiesOk, actual, entities, masked: g.masked };
}

async function viaApi(url: string, c: GuardCase): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: `guard-check-${Date.now()}`, message: c.input }),
  });
  const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const traceId = lines.find((e) => e.type === "meta")?.traceId ?? "-";
  const guard = lines.filter((e) => e.type === "guard").map((e) => `${e.stage}:${e.action}`);
  return `${traceId} ${guard.join(" ") || "(no guard event)"}`;
}

async function main() {
  const api = process.argv.includes("--api") ? process.argv[process.argv.indexOf("--api") + 1] : undefined;
  let failed = 0;
  for (const c of loadCases()) {
    const r = await judge(c);
    if (!r.ok) failed++;
    const extra = api ? await viaApi(api, c) : r.masked;
    console.log(`${r.ok ? "OK  " : "FAIL"} ${c.id.padEnd(20)} expect=${c.expect} actual=${r.actual} [${r.entities.join(",")}] ${extra}`);
  }
  console.log(failed === 0 ? "all passed" : `${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("guard-check.ts")) void main();
