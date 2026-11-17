import { describe, expect, it } from "vitest";
import { parseRequest } from "../src/chat.js";
import { chunkMarkdown, stripFrontMatter } from "../src/chunk.js";
import { buildMessages, loadPrompt } from "../src/prompt.js";
import { deltaFromChunk, SseParser } from "../src/sse.js";

describe("SseParser", () => {
  it("分割されて届いたイベントを組み立てる", () => {
    const p = new SseParser();
    expect(p.push('data: {"a"')).toEqual([]);
    expect(p.push(":1}\n\ndata: [DONE]\n\n")).toEqual(['{"a":1}', "[DONE]"]);
  });

  it("CRLF とコメント行を扱える", () => {
    const p = new SseParser();
    expect(p.push(": ping\r\n\r\ndata: x\r\n\r\n")).toEqual(["x"]);
  });
});

describe("deltaFromChunk", () => {
  it("本文の差分を返し、[DONE] は null", () => {
    expect(deltaFromChunk('{"choices":[{"delta":{"content":"こん"}}]}')).toBe("こん");
    expect(deltaFromChunk('{"choices":[{"delta":{}}]}')).toBe("");
    expect(deltaFromChunk("[DONE]")).toBeNull();
  });
});

describe("chunkMarkdown", () => {
  it("front matter の title を見出しに使い、見出しで分ける", () => {
    const md = "---\ntitle: Traces\n---\nintro\n\n## Spans\nspan text\n";
    expect(stripFrontMatter(md).title).toBe("Traces");
    expect(chunkMarkdown(md)).toEqual([
      { heading: "Traces", content: "intro" },
      { heading: "Traces > Spans", content: "span text" },
    ]);
  });

  it("長い節は重なりを持たせて分ける", () => {
    const md = `# A\n${"x".repeat(2500)}`;
    const chunks = chunkMarkdown(md, 1000, 100);
    expect(chunks.length).toBe(3);
    expect(chunks.every((c) => c.content.length <= 1000)).toBe(true);
  });

  it("Hugo のショートコードを落とす", () => {
    expect(chunkMarkdown("# A\nbefore {{< figure src=x >}} after")[0].content).toBe("before  after");
  });
});

describe("buildMessages", () => {
  it("参考資料を番号付きで system に入れ、履歴の後に質問を置く", () => {
    const msgs = buildMessages(
      "トレースとは？",
      [{ role: "user", content: "前の質問" }],
      [{ id: 1, source: "traces.md", heading: "Traces", content: "A trace is...", score: 0.9 }],
    );
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("[1] Traces（traces.md）");
    expect(msgs.at(-1)).toEqual({ role: "user", content: "トレースとは？" });
    expect(msgs).toHaveLength(3);
  });
});

describe("parseRequest", () => {
  it("空のメッセージを拒否する", () => {
    expect(() => parseRequest({ message: "  " })).toThrow();
  });
  it("sessionId が無ければ作る", () => {
    const r = parseRequest({ message: "hi" });
    expect(r.sessionId).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("chunkMarkdown の引数", () => {
  it("overlap が maxChars 以上なら、無限ループせずに失敗する", () => {
    expect(() => chunkMarkdown("# A\nbody", 100, 100)).toThrow();
    expect(() => chunkMarkdown("# A\nbody", 100, -1)).toThrow();
    expect(() => chunkMarkdown("# A\nbody", 1200.5, 150)).toThrow();
  });
});

describe("loadPrompt", () => {
  it("版のファイルを読み、中身の sha256 を付ける", () => {
    const p = loadPrompt("rag-chat", "v1");
    expect(p).toMatchObject({ name: "rag-chat", version: "v1" });
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.text).toContain("参考資料");
  });

  it("パスを抜け出す名前や版は読まない", () => {
    expect(() => loadPrompt("rag-chat", "../v1")).toThrow(/invalid/);
    expect(() => loadPrompt("../x", "v1")).toThrow(/invalid/);
  });
});
