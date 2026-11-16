// AIゲートウェイ（OpenAI 互換 API）の呼び出し。モデルの切り替えはゲートウェイ側の設定で行い、
// アプリは Ollama か Bedrock かを意識しない（ADR-001 / ADR-002）。
import { config } from "./config.js";
import { deltaFromChunk, SseParser } from "./sse.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const headers = (sessionId?: string): Record<string, string> => ({
  "content-type": "application/json",
  authorization: `Bearer ${config.gatewayApiKey}`,
  // ゲートウェイがトレースに載せる（compose.yaml の OTEL_AIGW_REQUEST_HEADER_ATTRIBUTES）
  ...(sessionId ? { "x-session-id": sessionId } : {}),
});

export async function embed(texts: string[], sessionId?: string): Promise<number[][]> {
  const res = await fetch(`${config.gatewayUrl}/embeddings`, {
    method: "POST",
    headers: headers(sessionId),
    body: JSON.stringify({ model: config.embedModel, input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** 生成結果をトークンごとに onToken へ渡し、最後に全文を返す */
export async function chatStream(
  messages: ChatMessage[],
  onToken: (text: string) => void,
  sessionId?: string,
): Promise<string> {
  const res = await fetch(`${config.gatewayUrl}/chat/completions`, {
    method: "POST",
    headers: headers(sessionId),
    body: JSON.stringify({ model: config.chatModel, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status} ${await res.text()}`);

  const parser = new SseParser();
  const decoder = new TextDecoder();
  let full = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    for (const data of parser.push(decoder.decode(chunk, { stream: true }))) {
      const delta = deltaFromChunk(data);
      if (delta === null) return full;
      if (delta) {
        full += delta;
        onToken(delta);
      }
    }
  }
  return full;
}

/** ストリーミングせずに1回で返す。json=true なら JSON で返すよう指定する（評価の判定役で使う） */
export async function chatComplete(
  messages: ChatMessage[],
  opts: { model?: string; json?: boolean; sessionId?: string } = {},
): Promise<string> {
  const res = await fetch(`${config.gatewayUrl}/chat/completions`, {
    method: "POST",
    headers: headers(opts.sessionId),
    body: JSON.stringify({
      model: opts.model ?? config.chatModel,
      messages,
      stream: false,
      temperature: 0,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  return body.choices[0]?.message.content ?? "";
}
