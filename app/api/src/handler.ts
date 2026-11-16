// Lambda（Node.js）のストリーミングハンドラー。API Gateway REST の
// レスポンスストリーミング（responseTransferMode: STREAM）から呼ばれる想定（ADR-011）。
// ローカルでは server.ts が同じ runChat を呼ぶ。
import type { APIGatewayProxyEvent } from "aws-lambda";
import { parseRequest, runChat } from "./chat.js";

// Lambda の Node.js ランタイムが用意するグローバル
declare const awslambda: {
  streamifyResponse: (
    fn: (event: APIGatewayProxyEvent, stream: NodeJS.WritableStream) => Promise<void>,
  ) => unknown;
  HttpResponseStream: {
    from: (
      stream: NodeJS.WritableStream,
      meta: { statusCode: number; headers?: Record<string, string> },
    ) => NodeJS.WritableStream;
  };
};

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  let req;
  try {
    req = parseRequest(JSON.parse(event.body ?? "null"));
  } catch (e) {
    const out = awslambda.HttpResponseStream.from(responseStream, { statusCode: 400 });
    out.write(JSON.stringify({ type: "error", message: (e as Error).message }) + "\n");
    out.end();
    return;
  }
  const out = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
  await runChat(req, (e) => out.write(JSON.stringify(e) + "\n"));
  out.end();
});
