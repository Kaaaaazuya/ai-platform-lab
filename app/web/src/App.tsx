import { useRef, useState } from "react";
import { streamChat, type ChatEvent } from "./ndjson";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8787/chat";
// Langfuse でトレースを開くためのURL（compose.yaml の LANGFUSE_INIT_PROJECT_ID）
const LANGFUSE_URL = import.meta.env.VITE_LANGFUSE_URL ?? "http://localhost:3000/project/rag-chat";

type Source = Extract<ChatEvent, { type: "sources" }>["sources"][number];
type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  traceId?: string;
  error?: string;
  guard?: string[];
};

type GuardEvent = Extract<ChatEvent, { type: "guard" }>;

// ガードレールの判定を画面に出す文言
function guardNote(e: GuardEvent): string {
  if (e.action === "block") return `ガードレールでブロックしました：${e.reason}`;
  if (e.action === "mask") return `質問に含まれる個人情報をマスクしてから送信しました（${e.entities.join(", ")}）`;
  return `回答に個人情報が含まれていたため、マスクした内容に差し替えました（${e.entities.join(", ")}）`;
}

export function App() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const updateLast = (fn: (m: Message) => Message) =>
    setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", text: message }, { role: "assistant", text: "" }]);
    abort.current = new AbortController();
    try {
      for await (const e of streamChat(API_URL, { sessionId, message }, abort.current.signal)) {
        if (e.type === "token") updateLast((m) => ({ ...m, text: m.text + e.text }));
        else if (e.type === "meta") updateLast((m) => ({ ...m, traceId: e.traceId }));
        else if (e.type === "sources") updateLast((m) => ({ ...m, sources: e.sources }));
        else if (e.type === "guard")
          updateLast((m) => ({
            ...m,
            text: e.action === "redact" ? e.text : m.text,
            guard: [...(m.guard ?? []), guardNote(e)],
          }));
        else if (e.type === "error") updateLast((m) => ({ ...m, error: e.message }));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") updateLast((m) => ({ ...m, error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <h1>RAG Chat</h1>
        <span className="session">session: {sessionId.slice(0, 8)}</span>
      </header>
      <section className="log">
        {messages.length === 0 && (
          <p className="hint">取り込んだドキュメントについて質問してください（例：トレースとスパンの違いは？）</p>
        )}
        {messages.map((m, i) => (
          <article key={i} className={m.role}>
            <div className="text">{m.text || (busy && i === messages.length - 1 ? "…" : "")}</div>
            {m.guard?.map((g, j) => (
              <div key={j} className="guard">
                {g}
              </div>
            ))}
            {m.error && <div className="error">エラー: {m.error}</div>}
            {m.sources && m.sources.length > 0 && (
              <ol className="sources">
                {m.sources.map((s) => (
                  <li key={s.n}>
                    [{s.n}] {s.heading} <small>({s.source}, {s.score.toFixed(2)})</small>
                  </li>
                ))}
              </ol>
            )}
            {m.traceId && (
              <a className="trace" href={`${LANGFUSE_URL}/traces/${m.traceId}`} target="_blank" rel="noreferrer">
                Langfuseでトレースを見る（{m.traceId.slice(0, 8)}）
              </a>
            )}
          </article>
        ))}
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          placeholder="質問を入力（⌘+Enterで送信）"
          rows={3}
        />
        {busy ? (
          <button type="button" onClick={() => abort.current?.abort()}>
            停止
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            送信
          </button>
        )}
      </form>
    </main>
  );
}
