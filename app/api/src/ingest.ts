// RAG の取り込み: data/docs 以下の Markdown をチャンクに分け、ゲートウェイ経由で
// 埋め込みを作って pgvector に入れる。
//   npm run ingest -w app/api -- ../../data/docs
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { chunkMarkdown } from "./chunk.js";
import { config } from "./config.js";
import { embed } from "./llm.js";
import { closeDb, ensureSchema, replaceSource, writeIndexMeta } from "./vector.js";

const BATCH = 16;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.mdx?$/.test(entry.name)) yield p;
  }
}

async function main() {
  const root = resolve(process.argv[2] ?? "../../data/docs");
  await ensureSchema();
  let files = 0;
  let total = 0;
  for await (const file of walk(root)) {
    const source = relative(root, file);
    const chunks = chunkMarkdown(await readFile(file, "utf8"), config.chunkMaxChars, config.chunkOverlap);
    if (chunks.length === 0) continue;
    const rows: { heading: string; content: string; embedding: number[] }[] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const vectors = await embed(batch.map((c) => `${c.heading}\n${c.content}`));
      for (const [j, c] of batch.entries()) rows.push({ ...c, embedding: vectors[j] });
    }
    await replaceSource(source, rows);
    files += 1;
    total += rows.length;
    console.log(`${source}: ${rows.length} chunks`);
  }
  await writeIndexMeta({
    embedModel: config.embedModel,
    chunkMaxChars: config.chunkMaxChars,
    chunkOverlap: config.chunkOverlap,
  });
  console.log(`done: ${files} files, ${total} chunks`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
