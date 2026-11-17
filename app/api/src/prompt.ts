import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import type { ChatMessage } from "./llm.js";

export type Retrieved = { id: number; source: string; heading: string; content: string; score: number };

// プロンプトは app/api/prompts/<名前>/<版>.md に置く（Issue #33）。
// 中身を変えるときは、ファイルを書き換えずに新しい版のファイルを足す。
// sha256 は中身から計算するので、版を上げ忘れて書き換えてもレポートで気づける。
export type PromptRef = { name: string; version: string; sha256: string };
export type Prompt = PromptRef & { text: string };

const PROMPTS_DIR = resolve(import.meta.dirname, "../prompts");
const SAFE = /^[a-z0-9][a-z0-9-]*$/;

export function loadPrompt(name: string, version: string, dir = PROMPTS_DIR): Prompt {
  if (!SAFE.test(name) || !SAFE.test(version)) throw new Error(`invalid prompt name or version: ${name}/${version}`);
  const text = readFileSync(resolve(dir, name, `${version}.md`), "utf8").trimEnd();
  const sha256 = createHash("sha256").update(text).digest("hex");
  return { name, version, sha256, text };
}

let cached: Prompt | undefined;
/** 今の設定（RAG_PROMPT_VERSION）で使うチャットのシステムプロンプト */
export const chatPrompt = (): Prompt => (cached ??= loadPrompt("rag-chat", config.promptVersion));

export const promptRef = ({ name, version, sha256 }: Prompt): PromptRef => ({ name, version, sha256 });

/** 検索結果を番号付きの参考資料にして、履歴と質問の前に置く */
export function buildMessages(
  question: string,
  history: ChatMessage[],
  retrieved: Retrieved[],
  prompt: Prompt = chatPrompt(),
): ChatMessage[] {
  const context = retrieved.map((r, i) => `[${i + 1}] ${r.heading}（${r.source}）\n${r.content}`).join("\n\n");
  return [
    { role: "system", content: `${prompt.text}\n\n# 参考資料\n${context || "（該当なし）"}` },
    ...history,
    { role: "user", content: question },
  ];
}
