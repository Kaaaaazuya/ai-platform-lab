// LLM-as-a-judge（ADR-008）。判定役のモデルもゲートウェイ経由で呼ぶので、採点のトレースも残る。
import { config } from "../config.js";
import { type ChatMessage, chatComplete } from "../llm.js";
import type { Retrieved } from "../prompt.js";

export type Judgement = { correctness: number; faithfulness: number; reason: string };

const JUDGE_SYSTEM = `あなたはRAGチャットの回答を採点する評価者です。次の2つを1〜5の整数で採点してください。
- correctness：模範解答の要点をどれだけ正しく含むか（5=要点をすべて正しく含む、1=誤り、または答えていない）
- faithfulness：回答が参考資料に書かれたことだけを根拠にしているか（5=すべて資料に基づく、1=資料にない内容が中心）
回答が「資料からは分かりません」で、参考資料にも答えがない場合は faithfulness を5にしてください。
出力は次のJSONだけにしてください：{"correctness": 整数, "faithfulness": 整数, "reason": "日本語で1〜2文"}`;

export function buildJudgeMessages(
  question: string,
  reference: string,
  answer: string,
  retrieved: Retrieved[],
): ChatMessage[] {
  const context = retrieved.map((r, i) => `[${i + 1}] ${r.heading}\n${r.content}`).join("\n\n") || "（なし）";
  return [
    { role: "system", content: JUDGE_SYSTEM },
    {
      role: "user",
      content: `# 質問\n${question}\n\n# 模範解答\n${reference}\n\n# 参考資料\n${context}\n\n# 採点する回答\n${answer}`,
    },
  ];
}

const clamp = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : Number.NaN;
};

/** 判定役の出力からJSONを取り出す。前後に文章やコードブロックが付いていても読む */
export function parseJudgement(text: string): Judgement {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`judge output is not JSON: ${text.slice(0, 120)}`);
  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const correctness = clamp(raw.correctness);
  const faithfulness = clamp(raw.faithfulness);
  if (Number.isNaN(correctness) || Number.isNaN(faithfulness)) {
    throw new Error(`judge output has no scores: ${text.slice(0, 120)}`);
  }
  return { correctness, faithfulness, reason: String(raw.reason ?? "") };
}

export async function judge(
  question: string,
  reference: string,
  answer: string,
  retrieved: Retrieved[],
  sessionId?: string,
): Promise<Judgement> {
  const text = await chatComplete(buildJudgeMessages(question, reference, answer, retrieved), {
    model: config.judgeModel,
    json: true,
    sessionId,
  });
  return parseJudgement(text);
}
