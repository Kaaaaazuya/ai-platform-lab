// RAG チャットの本体。Lambda ハンドラーとローカルサーバーの両方から呼ぶ。
// 出力は NDJSON の行（ChatEvent）として emit に渡す（ADR-011: ストリーミング）。
import { SpanStatusCode, context, trace, type Span } from "@opentelemetry/api";
import { guardInput, guardOutput, type PiiResult } from "./guard.js";
import { chatStream, embed } from "./llm.js";
import { buildMessages, type Retrieved } from "./prompt.js";
import { appendTurn, loadHistory } from "./store.js";
import { search } from "./vector.js";

export type ChatRequest = { sessionId: string; message: string };
export type ChatEvent =
  | { type: "meta"; traceId: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: { n: number; source: string; heading: string; score: number }[] }
  | { type: "guard"; stage: "input"; action: "block"; reason: string }
  | { type: "guard"; stage: "input"; action: "mask"; entities: string[] }
  | { type: "guard"; stage: "output"; action: "redact"; text: string; entities: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

const tracer = trace.getTracer("rag-api");

// Langfuse と OpenInference の両方が読める属性を付ける
function setIO(span: Span, kind: string, input: unknown, output?: unknown) {
  const s = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  span.setAttribute("openinference.span.kind", kind);
  span.setAttribute("input.value", s(input));
  span.setAttribute("langfuse.observation.input", s(input));
  if (output !== undefined) {
    span.setAttribute("output.value", s(output));
    span.setAttribute("langfuse.observation.output", s(output));
  }
}

// ガードレールの結果をspan属性にする（改善ループでLangfuseから抽出するため）
function setGuardAttrs(span: Span, pii: PiiResult, injection: string[] = [], blocked = false) {
  const entities = [...new Set(pii.findings.map((f) => f.entity))];
  span.setAttribute("guard.blocked", blocked);
  span.setAttribute("guard.pii.count", pii.findings.length);
  span.setAttribute("guard.pii.entities", entities.join(","));
  span.setAttribute("guard.injection.rules", injection.join(","));
  span.setAttribute("guard.engines", pii.engines.join(","));
  if (pii.presidioError) span.setAttribute("guard.presidio_error", pii.presidioError);
  if (blocked || entities.length > 0) span.setAttribute("langfuse.observation.level", "WARNING");
  return entities;
}

export async function runChat(req: ChatRequest, emit: (e: ChatEvent) => void): Promise<void> {
  await tracer.startActiveSpan("rag.chat", async (root) => {
    const traceId = root.spanContext().traceId;
    root.setAttribute("langfuse.trace.name", "rag-chat");
    root.setAttribute("session.id", req.sessionId);
    emit({ type: "meta", traceId });

    try {
      // 1. 入力ガード。ここから先（埋め込み・生成・トレース・履歴）はマスク後の文字列だけを使う
      const input = await tracer.startActiveSpan("rag.guard.input", async (span) => {
        try {
          const g = await guardInput(req.message);
          const entities = setGuardAttrs(span, g.pii, g.injection, g.blocked);
          setIO(span, "GUARDRAIL", g.masked, { blocked: g.blocked, entities, injection: g.injection });
          return { ...g, entities };
        } finally {
          span.end();
        }
      });
      setIO(root, "CHAIN", input.masked);
      root.setAttribute("guard.blocked", input.blocked);

      if (input.blocked) {
        emit({ type: "guard", stage: "input", action: "block", reason: input.reason ?? "blocked" });
        setIO(root, "CHAIN", input.masked, `[blocked] ${input.reason}`);
        root.setAttribute("langfuse.observation.level", "WARNING");
        emit({ type: "done" });
        return;
      }
      if (input.entities.length > 0) {
        emit({ type: "guard", stage: "input", action: "mask", entities: input.entities });
      }
      const question = input.masked;

      const history = await loadHistory(req.sessionId);

      const retrieved: Retrieved[] = await tracer.startActiveSpan("rag.retrieve", async (span) => {
        try {
          const [vec] = await embed([question], req.sessionId);
          const hits = await search(vec);
          setIO(span, "RETRIEVER", question, hits.map((h) => ({ heading: h.heading, score: h.score })));
          span.setAttribute("rag.top_score", hits[0]?.score ?? 0);
          return hits;
        } finally {
          span.end();
        }
      });

      const raw = await chatStream(
        buildMessages(question, history, retrieved),
        (text) => emit({ type: "token", text }),
        req.sessionId,
      );

      // 2. 出力ガード。表示済みの回答にPIIがあれば、マスク後の全文で差し替えさせる（ADR-005）
      const answer = await tracer.startActiveSpan("rag.guard.output", async (span) => {
        try {
          const g = await guardOutput(raw);
          const entities = setGuardAttrs(span, g.pii);
          setIO(span, "GUARDRAIL", "[generated answer]", { redacted: entities.length > 0, entities });
          if (entities.length > 0) emit({ type: "guard", stage: "output", action: "redact", text: g.masked, entities });
          return g.masked;
        } finally {
          span.end();
        }
      });

      emit({
        type: "sources",
        sources: retrieved.map((r, i) => ({ n: i + 1, source: r.source, heading: r.heading, score: r.score })),
      });
      setIO(root, "CHAIN", question, answer);

      await context.with(trace.setSpan(context.active(), root), () =>
        appendTurn(req.sessionId, question, answer, traceId),
      );
      emit({ type: "done" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      root.recordException(err as Error);
      root.setStatus({ code: SpanStatusCode.ERROR, message });
      emit({ type: "error", message });
    } finally {
      root.end();
    }
  });
}

export function parseRequest(body: unknown): ChatRequest {
  const b = body as Partial<ChatRequest> | null;
  if (!b || typeof b.message !== "string" || !b.message.trim()) {
    throw new Error("message is required");
  }
  const sessionId = typeof b.sessionId === "string" && b.sessionId ? b.sessionId : crypto.randomUUID();
  return { sessionId, message: b.message.trim().slice(0, 4000) };
}
