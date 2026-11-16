// 設定はすべて環境変数から読む（.env.example を参照）
const env = (name: string, fallback: string): string => process.env[name] ?? fallback;

export const config = {
  // AIゲートウェイ（Envoy AI Gateway）の OpenAI 互換 API。アプリはここだけを呼ぶ（ADR-001）
  gatewayUrl: env("GATEWAY_URL", "http://127.0.0.1:1975/v1"),
  gatewayApiKey: env("GATEWAY_API_KEY", "unused"),
  chatModel: env("CHAT_MODEL", "qwen2.5:7b"),
  embedModel: env("EMBED_MODEL", "bge-m3"),
  embedDim: Number(env("EMBED_DIM", "1024")),

  // RAG 用の pgvector
  databaseUrl: env("RAG_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5433/rag"),
  topK: Number(env("RAG_TOP_K", "4")),

  // 会話履歴（AWS Emulator 上の DynamoDB）。接続先は AWS_ENDPOINT_URL などで決まる
  conversationsTable: env("CONVERSATIONS_TABLE", "ai-platform-lab-conversations"),
  historyTurns: Number(env("HISTORY_TURNS", "6")),

  // ガードレール（ADR-005）。PRESIDIO_URL を空にすると独自ルールだけで動く
  presidioUrl: env("PRESIDIO_URL", "http://127.0.0.1:5002"),
  presidioEntities: env("PRESIDIO_ENTITIES", "EMAIL_ADDRESS,CREDIT_CARD,IP_ADDRESS,IBAN_CODE")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  guardTimeoutMs: Number(env("GUARD_TIMEOUT_MS", "2000")),

  port: Number(env("PORT", "8787")),
  corsOrigin: env("CORS_ORIGIN", "http://localhost:5173"),
};
