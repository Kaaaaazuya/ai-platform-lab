import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildJudgeMessages, parseJudgement } from "../src/eval/judge.js";
import {
  type CaseResult,
  type Conditions,
  compare,
  coverageProblem,
  diffConditions,
  hasCitation,
  indexMismatch,
  loadRagCases,
  median,
  retrievalHit,
  summarize,
} from "../src/eval/metrics.js";
import { assertSafeHost } from "../src/langfuse.js";

const result = (over: Partial<CaseResult> = {}): CaseResult => ({
  id: "x",
  traceId: "t",
  retrievalHit: true,
  cited: true,
  correctness: 4,
  faithfulness: 5,
  latencyMs: 1000,
  firstTokenMs: 200,
  ...over,
});

describe("parseJudgement", () => {
  it("前後の文章やコードブロックがあってもJSONを読む", () => {
    const j = parseJudgement('結果です\n```json\n{"correctness": 4, "faithfulness": "5", "reason": "要点あり"}\n```');
    expect(j).toEqual({ correctness: 4, faithfulness: 5, reason: "要点あり" });
  });

  it("範囲外の値は1〜5に丸める", () => {
    expect(parseJudgement('{"correctness": 9, "faithfulness": 0}')).toMatchObject({ correctness: 5, faithfulness: 1 });
  });

  it("スコアがなければ失敗にする", () => {
    expect(() => parseJudgement('{"reason": "x"}')).toThrow();
    expect(() => parseJudgement("採点できません")).toThrow();
  });
});

describe("buildJudgeMessages", () => {
  it("質問・模範解答・参考資料・回答をすべて渡す", () => {
    const [, user] = buildJudgeMessages("Q", "REF", "ANS", [
      { id: 1, source: "s.md", heading: "H", content: "C", score: 0.9 },
    ]);
    for (const part of ["Q", "REF", "[1] H\nC", "ANS"]) expect(user.content).toContain(part);
  });
});

describe("metrics", () => {
  it("検索の的中と引用を判定する", () => {
    expect(retrievalHit(["a.md"], ["b.md", "a.md"])).toBe(true);
    expect(retrievalHit(["a.md"], ["b.md"])).toBe(false);
    expect(hasCitation("スパンは処理単位です [1]")).toBe(true);
    expect(hasCitation("スパンは処理単位です")).toBe(false);
  });

  it("中央値", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("失敗したケースは0点として集計する", () => {
    const s = summarize([result(), result({ error: "boom", correctness: 0, faithfulness: 0 })]);
    expect(s).toMatchObject({ cases: 2, errors: 1, retrievalHitRate: 0.5, correctness: 2, latencyP50Ms: 1000 });
  });
});

describe("compare", () => {
  const base = summarize([result(), result()]);

  it("同じなら悪化なし", () => {
    expect(compare(base, base).regressions).toEqual([]);
  });

  it("しきい値を超えて下がった指標を悪化とする", () => {
    const cur = summarize([result({ correctness: 3 }), result({ correctness: 3, retrievalHit: false })]);
    expect(compare(base, cur).regressions).toEqual(["検索の的中率", "正しさ（1〜5）"]);
  });

  it("少しの揺れは許す", () => {
    const cur = summarize([result({ correctness: 4 }), result({ correctness: 3.6 })]);
    expect(compare(base, cur).regressions).toEqual([]);
  });

  it("レイテンシが1.5倍を超えたら悪化", () => {
    const cur = summarize([result({ latencyMs: 1600 }), result({ latencyMs: 1600 })]);
    expect(compare(base, cur).regressions).toEqual(["レイテンシ（中央値）"]);
  });
});

describe("eval/rag-cases.jsonl", () => {
  it("すべてのケースに質問・模範解答・期待する資料がある", () => {
    const cases = loadRagCases(resolve(import.meta.dirname, "../../../eval/rag-cases.jsonl"));
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) for (const s of c.sources) expect(s).toMatch(/^opentelemetry\/.+\.md$/);
  });
});

describe("coverageProblem", () => {
  const report = (ids: string[]) => ({
    createdAt: "",
    chatModel: "m",
    judgeModel: "m",
    summary: summarize([]),
    results: ids.map((id) => result({ id })),
  });

  it("同じケースなら問題なし", () => {
    expect(coverageProblem(report(["a", "b"]), report(["b", "a"]))).toBeNull();
  });

  it("--limit で一部だけ流したレポートは比べない", () => {
    expect(coverageProblem(report(["a", "b", "c"]), report(["a"]))).toContain("今回にないケース：b、c");
  });

  it("重複したケースは比べない", () => {
    expect(coverageProblem(report(["a", "b"]), report(["a", "a"]))).toContain("重複");
  });
});

describe("assertSafeHost", () => {
  it("https とループバックの http は通す", () => {
    for (const h of [
      "https://cloud.langfuse.com",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      "http://[::1]:3000",
    ]) {
      expect(() => assertSafeHost(h)).not.toThrow();
    }
  });

  it("リモートの http は止める", () => {
    expect(() => assertSafeHost("http://langfuse.example.com")).toThrow();
  });
});

const conditions = (over: Partial<Conditions> = {}): Conditions => ({
  prompt: { name: "rag-chat", version: "v1", sha256: "a".repeat(64) },
  chatModel: "qwen2.5:7b",
  judgeModel: "qwen2.5:7b",
  embedModel: "bge-m3",
  topK: 4,
  index: { embedModel: "bge-m3", chunkMaxChars: 1200, chunkOverlap: 150, ingestedAt: "2026-11-17T00:00:00.000Z" },
  gatewayConfigSha256: "b".repeat(64),
  ...over,
});

describe("diffConditions", () => {
  it("同じ条件なら、そう書く（取り込み日時の違いは無視する）", () => {
    const cur = conditions({
      index: { embedModel: "bge-m3", chunkMaxChars: 1200, chunkOverlap: 150, ingestedAt: "2026-11-18T00:00:00.000Z" },
    });
    expect(diffConditions(conditions(), cur)).toBe("条件は同じです。");
  });

  it("違う項目だけを表にする", () => {
    const cur = conditions({ prompt: { name: "rag-chat", version: "v2", sha256: "c".repeat(64) }, topK: 6 });
    const md = diffConditions(conditions(), cur);
    expect(md).toContain("| プロンプト | rag-chat/v1 | rag-chat/v2 |");
    expect(md).toContain("| topK | 4 | 6 |");
    expect(md).not.toContain("チャットのモデル");
  });

  it("古いレポートで条件がなければ、比べられないと書く", () => {
    expect(diffConditions(undefined, conditions())).toContain("比べられません");
  });
});

describe("indexMismatch", () => {
  it("取り込み時と今の埋め込みモデルが違えば知らせる", () => {
    expect(indexMismatch(conditions())).toBeNull();
    expect(indexMismatch(conditions({ embedModel: "other" }))).toContain("bge-m3");
    expect(indexMismatch(conditions({ index: null }))).toContain("task ingest");
  });
});
