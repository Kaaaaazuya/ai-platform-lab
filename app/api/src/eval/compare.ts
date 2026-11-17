// eval/baseline.json と eval/reports/latest.json の集計を比べる（ADR-008）。
// 悪化した指標があれば終了コード1。GitHub Actions では結果をジョブのサマリーに書く。
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compare, coverageProblem, diffConditions, type Report } from "./metrics.js";

const ROOT = resolve(import.meta.dirname, "../../../..");
const basePath = resolve(ROOT, process.argv[2] ?? "eval/baseline.json");
const curPath = resolve(ROOT, process.argv[3] ?? "eval/reports/latest.json");

function write(text: string) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

if (!existsSync(basePath) || !existsSync(curPath)) {
  const missing = [basePath, curPath].filter((p) => !existsSync(p)).map((p) => p.replace(`${ROOT}/`, ""));
  write(`## RAGの評価\n\n比べるレポートがないので飛ばしました（${missing.join("、")}）。`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(basePath, "utf8")) as Report;
const cur = JSON.parse(readFileSync(curPath, "utf8")) as Report;
const problem = coverageProblem(base, cur);
if (problem) {
  write(`## RAGの評価\n\n${problem}`);
  process.exit(1);
}
const { regressions, markdown } = compare(base.summary, cur.summary);

write(
  [
    "## RAGの評価",
    "",
    `ベースライン：${base.createdAt}（${base.chatModel}） / 今回：${cur.createdAt}（${cur.chatModel}）`,
    "",
    markdown,
    "",
    "### 評価の条件の違い",
    "",
    diffConditions(base.conditions, cur.conditions),
  ].join("\n"),
);
process.exit(regressions.length ? 1 : 0);
