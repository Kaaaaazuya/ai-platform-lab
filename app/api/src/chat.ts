// RAG チャットの本体。Lambda ハンドラーとローカルサーバーの両方から呼ぶ。
// 出力は NDJSON の行（ChatEvent）として emit に渡す（ADR-011: ストリーミング）。
import { SpanStatusCode, context, trace, type Span } from "@opentelemetry/api";
import { chatStream, embed } from "./llm.js";
import { buildMessages, type Retrieved } from "./prompt.js";
import { appendTurn, loadHistory } from "./store.js";
import { search } from "./vector.js";

export type ChatRequest = { sessionId: string; message: string };
export type ChatEvent =
  | { type: "meta"; traceId: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: { n: number; source: string; heading: string; score: number }[] }
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

export async function runChat(req: ChatRequest, emit: (e: ChatEvent) => void): Promise<void> {
  await tracer.startActiveSpan("rag.chat", async (root) => {
    const traceId = root.spanContext().traceId;
    root.setAttribute("langfuse.trace.name", "rag-chat");
    root.setAttribute("session.id", req.sessionId);
    setIO(root, "CHAIN", req.message);
    emit({ type: "meta", traceId });

    try {
      const history = await loadHistory(req.sessionId);

      const retrieved: Retrieved[] = await tracer.startActiveSpan("rag.retrieve", async (span) => {
        try {
          const [vec] = await embed([req.message], req.sessionId);
          const hits = await search(vec);
          setIO(span, "RETRIEVER", req.message, hits.map((h) => ({ heading: h.heading, score: h.score })));
          span.setAttribute("rag.top_score", hits[0]?.score ?? 0);
          return hits;
        } finally {
          span.end();
        }
      });

      const answer = await chatStream(
        buildMessages(req.message, history, retrieved),
        (text) => emit({ type: "token", text }),
        req.sessionId,
      );

      emit({
        type: "sources",
        sources: retrieved.map((r, i) => ({ n: i + 1, source: r.source, heading: r.heading, score: r.score })),
      });
      setIO(root, "CHAIN", req.message, answer);

      await context.with(trace.setSpan(context.active(), root), () =>
        appendTurn(req.sessionId, req.message, answer, traceId),
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
