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

export async function replaceSource(
  source: string,
  rows: { heading: string; content: string; embedding: number[] }[],
): Promise<void> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE source = $1", [source]);
    for (const r of rows) {
      await client.query(
        "INSERT INTO chunks (source, heading, content, embedding) VALUES ($1, $2, $3, $4)",
        [source, r.heading, r.content, toVector(r.embedding)],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
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
