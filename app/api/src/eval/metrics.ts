// 評価の集計と、ベースラインとの比較（ADR-008）。LLMを呼ばないのでCIでも動く。
import { readFileSync } from "node:fs";

export type RagCase = { id: string; question: string; reference: string; sources: string[] };

export type CaseResult = {
  id: string;
  traceId: string;
  retrievalHit: boolean; // 期待する資料が検索結果に入ったか
  cited: boolean; // 回答に [n] の引用があるか
  correctness: number; // 1〜5（LLM-as-a-judge）
  faithfulness: number; // 1〜5（LLM-as-a-judge）
  latencyMs: number;
  firstTokenMs: number | null;
  error?: string;
  judgeReason?: string;
};

export type Summary = {
  cases: number;
  errors: number;
  retrievalHitRate: number;
  citationRate: number;
  correctness: number;
  faithfulness: number;
  latencyP50Ms: number;
};

export type Report = {
  createdAt: string;
  chatModel: string;
  judgeModel: string;
  summary: Summary;
  results: CaseResult[];
};

export function loadRagCases(path: string): RagCase[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      const c = JSON.parse(l) as RagCase;
      if (!c.id || !c.question || !c.reference || !Array.isArray(c.sources) || c.sources.length === 0) {
        throw new Error(`${path}:${i + 1} に id・question・reference・sources がそろっていません`);
      }
      return c;
    });
}

export const retrievalHit = (expected: string[], retrieved: string[]): boolean =>
  expected.some((s) => retrieved.includes(s));

export const hasCitation = (answer: string): boolean => /\[\d+\]/.test(answer);

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(results: CaseResult[]): Summary {
  // 失敗したケースは0点として扱う（失敗が増えてもスコアが上がって見えないように）
  const ok = results.filter((r) => !r.error);
  const rate = (f: (r: CaseResult) => boolean) => (results.length ? results.filter(f).length / results.length : 0);
  return {
    cases: results.length,
    errors: results.length - ok.length,
    retrievalHitRate: rate((r) => !r.error && r.retrievalHit),
    citationRate: rate((r) => !r.error && r.cited),
    correctness: mean(results.map((r) => (r.error ? 0 : r.correctness))),
    faithfulness: mean(results.map((r) => (r.error ? 0 : r.faithfulness))),
    latencyP50Ms: median(ok.map((r) => r.latencyMs)),
  };
}

// どれだけ下がったら回帰とみなすか。ローカルLLMは揺れるので、少しの差は許す
export const THRESHOLDS = {
  retrievalHitRate: 0.1, // 割合で10ポイント
  citationRate: 0.1,
  correctness: 0.3, // 5段階で0.3
  faithfulness: 0.3,
  latencyP50Ratio: 1.5, // 中央値が1.5倍を超えたら
};

export type Comparison = { regressions: string[]; markdown: string };

export function compare(base: Summary, cur: Summary): Comparison {
  const regressions: string[] = [];
  const rows: string[] = [];
  const row = (name: string, b: number, c: number, fmt: (n: number) => string, regressed: boolean) => {
    const diff = c - b;
    const sign = diff > 0 ? "+" : "";
    rows.push(`| ${name} | ${fmt(b)} | ${fmt(c)} | ${sign}${fmt(diff)} | ${regressed ? "悪化" : ""} |`);
    if (regressed) regressions.push(name);
  };
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const pt = (n: number) => n.toFixed(2);
  const ms = (n: number) => `${Math.round(n)}ms`;

  row(
    "検索の的中率",
    base.retrievalHitRate,
    cur.retrievalHitRate,
    pct,
    base.retrievalHitRate - cur.retrievalHitRate > THRESHOLDS.retrievalHitRate,
  );
  row(
    "引用の付与率",
    base.citationRate,
    cur.citationRate,
    pct,
    base.citationRate - cur.citationRate > THRESHOLDS.citationRate,
  );
  row(
    "正しさ（1〜5）",
    base.correctness,
    cur.correctness,
    pt,
    base.correctness - cur.correctness > THRESHOLDS.correctness,
  );
  row(
    "根拠への忠実さ（1〜5）",
    base.faithfulness,
    cur.faithfulness,
    pt,
    base.faithfulness - cur.faithfulness > THRESHOLDS.faithfulness,
  );
  row(
    "レイテンシ（中央値）",
    base.latencyP50Ms,
    cur.latencyP50Ms,
    ms,
    base.latencyP50Ms > 0 && cur.latencyP50Ms > base.latencyP50Ms * THRESHOLDS.latencyP50Ratio,
  );
  row("失敗したケース", base.errors, cur.errors, (n) => String(n), cur.errors > base.errors);

  const markdown = [
    "| 指標 | ベースライン | 今回 | 差 | 判定 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    regressions.length ? `悪化：${regressions.join("、")}` : "悪化した指標はありません。",
  ].join("\n");
  return { regressions, markdown };
}

/** 2つのレポートが同じケースを1回ずつ含んでいるかを確かめる。問題があれば理由を返す */
export function coverageProblem(base: Report, cur: Report): string | null {
  const ids = (r: Report) => r.results.map((x) => x.id);
  for (const [name, r] of [
    ["ベースライン", base],
    ["今回", cur],
  ] as const) {
    const list = ids(r);
    if (new Set(list).size !== list.length) return `${name}のレポートに同じケースが重複しています`;
  }
  const b = new Set(ids(base));
  const c = new Set(ids(cur));
  const missing = [...b].filter((id) => !c.has(id));
  const extra = [...c].filter((id) => !b.has(id));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`今回にないケース：${missing.join("、")}`);
    if (extra.length) parts.push(`ベースラインにないケース：${extra.join("、")}`);
    return `ケースの範囲が違うので比べられません（${parts.join("。")}）。--limit を付けずに実行し直すか、ベースラインを作り直してください`;
  }
  return null;
}
