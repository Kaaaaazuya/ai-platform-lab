// ローカル開発用の HTTP サーバー。API Gateway＋Lambda の代わりに、同じ runChat を
// NDJSON のストリーミングで返す（AWS Emulator が API Gateway のストリーミングを
// 再現するかは未確認のため。ADR-011 の確認事項）。
import { createServer } from "node:http";
import { config } from "./config.js";
import { parseRequest, runChat } from "./chat.js";

const cors = {
  "access-control-allow-origin": config.corsOrigin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, traceparent",
};

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (req.method !== "POST" || req.url !== "/chat") {
    res.writeHead(404, cors).end();
    return;
  }

  let raw = "";
  for await (const part of req) raw += part;
  let chatReq;
  try {
    chatReq = parseRequest(JSON.parse(raw || "null"));
  } catch (e) {
    res.writeHead(400, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", message: (e as Error).message }));
    return;
  }

  res.writeHead(200, {
    ...cors,
    "content-type": "application/x-ndjson",
    "cache-control": "no-cache",
    "x-session-id": chatReq.sessionId,
  });
  await runChat(chatReq, (e) => res.write(JSON.stringify(e) + "\n"));
  res.end();
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`rag-api listening on http://127.0.0.1:${config.port}`);
});
