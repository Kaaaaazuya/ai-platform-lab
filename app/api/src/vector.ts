// pgvector への保存と検索（ADR-003: 仮決め pgvector）
import pg from "pg";
import { config } from "./config.js";
import type { Retrieved } from "./prompt.js";

let pool: pg.Pool | undefined;
const db = () => (pool ??= new pg.Pool({ connectionString: config.databaseUrl }));

const toVector = (v: number[]) => `[${v.join(",")}]`;

export async function ensureSchema(dim = config.embedDim): Promise<void> {
  await db().query("CREATE EXTENSION IF NOT EXISTS vector");
  await db().query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id        BIGSERIAL PRIMARY KEY,
      source    TEXT NOT NULL,
      heading   TEXT NOT NULL,
      content   TEXT NOT NULL,
      embedding vector(${dim}) NOT NULL
    )`);
  await db().query(
    "CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)",
  );
}

// 取り込みの条件（埋め込みモデル、チャンク分割）を1行だけ持つ。評価レポートが読む（Issue #33）
export type IndexMeta = { embedModel: string; chunkMaxChars: number; chunkOverlap: number; ingestedAt: string };

async function ensureMetaTable(): Promise<void> {
  await db().query(`
    CREATE TABLE IF NOT EXISTS index_meta (
      id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      embed_model     TEXT NOT NULL,
      chunk_max_chars INT NOT NULL,
      chunk_overlap   INT NOT NULL,
      ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

/** 取り込みの開始時に呼ぶ。途中で失敗したら条件が残らず、評価は「記録なし」と警告する */
export async function clearIndexMeta(): Promise<void> {
  await ensureMetaTable();
  await db().query("DELETE FROM index_meta");
}

/** 取り込みがすべて終わってから呼ぶ */
export async function writeIndexMeta(meta: Omit<IndexMeta, "ingestedAt">): Promise<void> {
  await ensureMetaTable();
  await db().query(
    `INSERT INTO index_meta (id, embed_model, chunk_max_chars, chunk_overlap, ingested_at)
       VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET embed_model = $1, chunk_max_chars = $2, chunk_overlap = $3, ingested_at = now()`,
    [meta.embedModel, meta.chunkMaxChars, meta.chunkOverlap],
  );
}

/** 取り込みの条件。取り込みがこの仕組みより前なら null */
export async function readIndexMeta(): Promise<IndexMeta | null> {
  const { rows } = await db()
    .query(`SELECT embed_model, chunk_max_chars, chunk_overlap, ingested_at FROM index_meta WHERE id = 1`)
    .catch((e: { code?: string }) => {
      if (e.code === "42P01") return { rows: [] }; // テーブルがまだない
      throw e;
    });
  const r = rows[0];
  if (!r) return null;
  return {
    embedModel: r.embed_model,
    chunkMaxChars: Number(r.chunk_max_chars),
    chunkOverlap: Number(r.chunk_overlap),
    ingestedAt: new Date(r.ingested_at).toISOString(),
  };
}

export async function replaceSource(
  source: string,
  rows: { heading: string; content: string; embedding: number[] }[],
): Promise<void> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE source = $1", [source]);
    for (const r of rows) {
      await client.query("INSERT INTO chunks (source, heading, content, embedding) VALUES ($1, $2, $3, $4)", [
        source,
        r.heading,
        r.content,
        toVector(r.embedding),
      ]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** 今回の取り込み対象にないソースのチャンクを消す。残すと、条件の違うチャンクが検索に混ざる */
export async function deleteOtherSources(keep: string[]): Promise<number> {
  const { rowCount } = await db().query("DELETE FROM chunks WHERE NOT (source = ANY($1::text[]))", [keep]);
  return rowCount ?? 0;
}

export async function search(embedding: number[], k = config.topK): Promise<Retrieved[]> {
  const { rows } = await db().query(
    `SELECT id, source, heading, content, 1 - (embedding <=> $1) AS score
       FROM chunks ORDER BY embedding <=> $1 LIMIT $2`,
    [toVector(embedding), k],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), score: Number(r.score) }));
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
