// Langfuse の Public API。評価スコアをトレースに付け、データセットの実験として記録する（ADR-008）。
// 鍵がなければ何もしない。評価そのものは Langfuse がなくても動く。
import { config } from "./config.js";

const enabled = () => Boolean(config.langfusePublicKey && config.langfuseSecretKey);

async function call(path: string, body: unknown): Promise<void> {
  const auth = Buffer.from(`${config.langfusePublicKey}:${config.langfuseSecretKey}`).toString("base64");
  const res = await fetch(`${config.langfuseHost}/api/public/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`langfuse ${path}: ${res.status} ${await res.text()}`);
}

export type LangfuseScore = { traceId: string; name: string; value: number; comment?: string };

export async function postScores(scores: LangfuseScore[]): Promise<void> {
  if (!enabled()) return;
  for (const s of scores) {
    await call("scores", { traceId: s.traceId, name: s.name, value: s.value, comment: s.comment, dataType: "NUMERIC" });
  }
}

/** データセットとアイテムを作る（同じIDなら上書き） */
export async function upsertDataset(
  name: string,
  items: { id: string; input: unknown; expectedOutput: unknown }[],
): Promise<void> {
  if (!enabled()) return;
  await call("datasets", { name, description: "RAGチャットの回帰評価（eval/rag-cases.jsonl）" });
  for (const item of items) {
    await call("dataset-items", {
      datasetName: name,
      id: `${name}:${item.id}`,
      input: item.input,
      expectedOutput: item.expectedOutput,
    });
  }
}

/** 実行したトレースを、データセットの実験（run）に結び付ける */
export async function linkRunItem(
  datasetName: string,
  runName: string,
  caseId: string,
  traceId: string,
): Promise<void> {
  if (!enabled()) return;
  await call("dataset-run-items", { runName, datasetItemId: `${datasetName}:${caseId}`, traceId });
}

export const langfuseEnabled = enabled;
