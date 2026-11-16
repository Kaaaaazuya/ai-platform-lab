// 会話履歴の保存（AWS Emulator 上の DynamoDB。実AWSでも同じコード）
// 接続先は SDK が AWS_ENDPOINT_URL / AWS_CONFIG_FILE などの環境変数から決める。
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "./config.js";
import type { ChatMessage } from "./llm.js";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function loadHistory(sessionId: string): Promise<ChatMessage[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: config.conversationsTable,
      KeyConditionExpression: "sessionId = :s",
      ExpressionAttributeValues: { ":s": sessionId },
      ScanIndexForward: false,
      Limit: config.historyTurns * 2,
    }),
  );
  return (out.Items ?? []).reverse().map((i) => ({ role: i.role as ChatMessage["role"], content: String(i.content) }));
}

export async function appendTurn(sessionId: string, question: string, answer: string, traceId?: string): Promise<void> {
  const now = Date.now();
  const put = (offset: number, role: string, content: string) =>
    doc.send(
      new PutCommand({
        TableName: config.conversationsTable,
        Item: { sessionId, ts: new Date(now + offset).toISOString(), role, content, traceId },
      }),
    );
  await put(0, "user", question);
  await put(1, "assistant", answer);
}
