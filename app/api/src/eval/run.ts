// 評価ランナー（ADR-008、M4）。eval/rag-cases.jsonl の各質問を RAG チャットに流し、
// 検索の的中・引用の有無・LLM-as-a-judge の採点を集計して eval/reports/latest.json に書く。
//   npm run eval                  … 全ケース
//   npm run eval -- --limit 3     … 先頭3件だけ（動作確認用）
// Langfuse の鍵があれば、スコアをトレースに付け、データセットの実験として記録する。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type ChatEvent, runChat } from "../chat.js";
import { config } from "../config.js";
import { langfuseEnabled, linkRunItem, postScores, upsertDataset } from "../langfuse.js";
import type { Retrieved } from "../prompt.js";
import { shutdownTelemetry } from "../telemetry.js";
import { closeDb } from "../vector.js";
import { judge } from "./judge.js";
import {
  type CaseResult,
  hasCitation,
  loadRagCases,
  type RagCase,
  type Report,
  retrievalHit,
  summarize,
} from "./metrics.js";

const ROOT = resolve(import.meta.dirname, "../../../..");
const DATASET = "rag-eval";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function runCase(c: RagCase, runName: string): Promise<CaseResult> {
  const sessionId = `eval-${runName}-${c.id}`;
  const started = performance.now();
  let firstTokenMs: number | null = null;
  let answer = "";
  let traceId = "";
  let error: string | undefined;
  let retrieved: Retrieved[] = [];

  await runChat(
    { sessionId, message: c.question },
    (e: ChatEvent) => {
      if (e.type === "meta") traceId = e.traceId;
      else if (e.type === "token") {
        firstTokenMs ??= performance.now() - started;
        answer += e.text;
      } else if (e.type === "guard" && e.action === "redact") answer = e.text;
      else if (e.type === "guard" && e.action === "block") error = `blocked: ${e.reason}`;
      else if (e.type === "error") error = e.message;
    },
    { onRetrieved: (r) => (retrieved = r) },
  );
  const latencyMs = performance.now() - started;
  const base = {
    id: c.id,
    traceId,
    retrievalHit: retrievalHit(
      c.sources,
      retrieved.map((r) => r.source),
    ),
    cited: hasCitation(answer),
    latencyMs,
    firstTokenMs,
  };
  if (error) return { ...base, correctness: 0, faithfulness: 0, error };

  try {
    const j = await judge(c.question, c.reference, answer, retrieved, sessionId);
    return { ...base, correctness: j.correctness, faithfulness: j.faithfulness, judgeReason: j.reason };
  } catch (e) {
    return { ...base, correctness: 0, faithfulness: 0, error: `judge: ${(e as Error).message}` };
  }
}

async function main() {
  const cases = loadRagCases(resolve(ROOT, "eval/rag-cases.jsonl"));
  const limit = Number(arg("--limit") ?? cases.length);
  const out = resolve(ROOT, arg("--out") ?? "eval/reports/latest.json");
  const runName = new Date().toISOString().replace(/[:.]/g, "-");

  await upsertDataset(
    DATASET,
    cases.map((c) => ({ id: c.id, input: c.question, expectedOutput: c.reference })),
  ).catch((e) => console.warn(`Langfuse のデータセット登録に失敗: ${(e as Error).message}`));

  const results: CaseResult[] = [];
  for (const c of cases.slice(0, limit)) {
    const r = await runCase(c, runName);
    results.push(r);
    const mark = r.error ? "ERR " : r.retrievalHit ? "HIT " : "MISS";
    console.log(
      `${mark} ${c.id.padEnd(22)} 正しさ=${r.correctness} 忠実さ=${r.faithfulness} 引用=${r.cited ? "あり" : "なし"} ${Math.round(r.latencyMs)}ms ${r.error ?? ""}`,
    );
    if (r.traceId) {
      await postScores([
        { traceId: r.traceId, name: "eval.correctness", value: r.correctness, comment: r.judgeReason },
        { traceId: r.traceId, name: "eval.faithfulness", value: r.faithfulness },
        { traceId: r.traceId, name: "eval.retrieval_hit", value: r.retrievalHit ? 1 : 0 },
      ])
        .then(() => linkRunItem(DATASET, runName, c.id, r.traceId))
        .catch((e) => console.warn(`Langfuse への記録に失敗: ${(e as Error).message}`));
    }
  }

  const report: Report = {
    createdAt: new Date().toISOString(),
    chatModel: config.chatModel,
    judgeModel: config.judgeModel,
    summary: summarize(results),
    results,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`wrote ${out}${langfuseEnabled() ? `（Langfuse の実験名: ${runName}）` : ""}`);
  await closeDb();
}

void main().then(
  async () => {
    await shutdownTelemetry(); // 送信待ちのspanを送り切ってから終わる
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
