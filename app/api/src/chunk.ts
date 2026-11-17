// Markdown を RAG 用のチャンクに分ける。見出しで区切り、長い節はさらに文字数で分ける。

export type Chunk = { heading: string; content: string };

/** 先頭の YAML front matter を取り除き、title があれば返す */
export function stripFrontMatter(md: string): { title?: string; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { body: md };
  const title = m[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  return { title, body: md.slice(m[0].length) };
}

export type ChunkOptions = { maxChars: number; overlap: number };

export function chunkMarkdown(md: string, maxChars = 1200, overlap = 150): Chunk[] {
  // overlap が maxChars 以上だと、下の分割が先に進まない
  if (!(maxChars > 0) || !(overlap >= 0) || overlap >= maxChars) {
    throw new Error(`invalid chunk options: maxChars=${maxChars} overlap=${overlap}`);
  }
  const { title, body } = stripFrontMatter(md);
  const lines = body
    // Hugo のショートコードなど、本文でない記法を落とす
    .replace(/\{\{[<%][\s\S]*?[%>]\}\}/g, "")
    .split(/\r?\n/);

  const sections: Chunk[] = [];
  let heading = title ?? "";
  let buf: string[] = [];
  const flush = () => {
    const content = buf.join("\n").trim();
    if (content) sections.push({ heading, content });
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      flush();
      heading = title && h[1] !== title ? `${title} > ${h[1].trim()}` : h[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();

  // 長い節を maxChars ごとに、overlap 文字だけ重ねて分ける
  const out: Chunk[] = [];
  for (const s of sections) {
    if (s.content.length <= maxChars) {
      out.push(s);
      continue;
    }
    for (let start = 0; start < s.content.length; start += maxChars - overlap) {
      out.push({ heading: s.heading, content: s.content.slice(start, start + maxChars) });
      if (start + maxChars >= s.content.length) break;
    }
  }
  return out;
}
