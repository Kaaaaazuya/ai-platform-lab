import type { ChatMessage } from "./llm.js";

export type Retrieved = { id: number; source: string; heading: string; content: string; score: number };

export const SYSTEM_PROMPT = `あなたは技術ドキュメントについて答えるアシスタントです。
- 回答は日本語で、簡潔に書いてください。
- 下の「参考資料」に書かれていることだけを根拠にしてください。根拠がなければ「資料からは分かりません」と答えてください。
- 根拠にした資料は、文末に [1] のように番号で示してください。`;

/** 検索結果を番号付きの参考資料にして、履歴と質問の前に置く */
export function buildMessages(
  question: string,
  history: ChatMessage[],
  retrieved: Retrieved[],
): ChatMessage[] {
  const context = retrieved
    .map((r, i) => `[${i + 1}] ${r.heading}（${r.source}）\n${r.content}`)
    .join("\n\n");
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n# 参考資料\n${context || "（該当なし）"}` },
    ...history,
    { role: "user", content: question },
  ];
}
