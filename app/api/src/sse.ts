// OpenAI 互換 API のストリーミング応答（Server-Sent Events）を読むための小さなパーサー。
// 受け取った文字列を少しずつ渡すと、完成した `data:` 行の中身を返す。

export class SseParser {
  private buffer = "";

  /** 新しく届いた文字列を渡し、完成したイベントの data を順に返す */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const events: string[] = [];
    // イベントは空行（\n\n）で区切られる
    for (let sep = this.buffer.search(/\r?\n\r?\n/); sep !== -1; sep = this.buffer.search(/\r?\n\r?\n/)) {
      const raw = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
      const data = raw
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) events.push(data);
    }
    return events;
  }
}

/** chat.completions のチャンク（JSON文字列）から本文の差分を取り出す。[DONE] は null */
export function deltaFromChunk(data: string): string | null {
  if (data === "[DONE]") return null;
  const parsed = JSON.parse(data) as {
    choices?: { delta?: { content?: string | null } }[];
  };
  return parsed.choices?.[0]?.delta?.content ?? "";
}
