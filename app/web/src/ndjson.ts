// API の NDJSON ストリームを1行ずつイベントにする
export type ChatEvent =
  | { type: "meta"; traceId: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: { n: number; source: string; heading: string; score: number }[] }
  | { type: "error"; message: string }
  | { type: "done" };

export class NdjsonParser {
  private buffer = "";
  push(chunk: string): ChatEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines.filter((l) => l.trim()).map((l) => JSON.parse(l) as ChatEvent);
  }
}

export async function* streamChat(
  url: string,
  body: { sessionId: string; message: string },
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new NdjsonParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield* parser.push(value);
  }
}
