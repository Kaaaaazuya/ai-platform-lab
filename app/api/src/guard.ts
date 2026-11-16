// ガードレール（ADR-005）。LLMに送る前の入力と、生成後の出力を検査する。
// - PII: Presidio（メール・カード番号などの汎用ルール）＋日本向けの独自ルール（このファイル）
// - プロンプトインジェクション: ルールベース（M3時点。LLM判定はM4以降に検討）
// ログ方針は「マスク後のみ」。トレースや履歴には mask() 後の文字列だけを渡す。
import { config } from "./config.js";

export type Finding = {
  entity: string;
  start: number; // コードポイント単位（Presidio と同じ）
  end: number;
  score: number;
  engine: "presidio" | "local";
};

type Rule = { entity: string; re: RegExp; score: number; validate?: (m: string) => boolean };

const digits = (s: string) => s.replace(/\D/g, "");

// クレジットカード番号のチェックディジット
export function luhn(num: string): boolean {
  const d = digits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

// 日本の個人情報。ラベル（「口座番号」など）は残し、値だけを拾う
export const LOCAL_RULES: Rule[] = [
  { entity: "EMAIL_ADDRESS", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, score: 0.9 },
  {
    entity: "CREDIT_CARD",
    re: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    score: 0.9,
    validate: luhn,
  },
  { entity: "JP_MY_NUMBER", re: /(?<=(?:マイナンバー|個人番号)[\s:：はが]*)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)/g, score: 0.9 },
  { entity: "JP_BANK_ACCOUNT", re: /(?<=口座(?:番号)?[\s:：はが]*(?:普通|当座)?[\s:：]*)\d{7}(?!\d)/g, score: 0.85 },
  { entity: "JP_PHONE_NUMBER", re: /(?<![\d-])0(?:[789]0-?\d{4}-?\d{4}|\d{1,4}-\d{1,4}-\d{3,4})(?![\d-])/g, score: 0.8 },
  { entity: "JP_POSTAL_CODE", re: /(?<=〒\s?)\d{3}-?\d{4}(?!\d)/g, score: 0.8 },
  {
    entity: "JP_PERSON_NAME",
    re: /(?<=(?:氏名|名前|お名前)[\s:：はが]*)[\p{Script=Han}]{1,4}[\s　]?[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{1,5}/gu,
    score: 0.7,
  },
];

// JSの文字列位置（UTF-16）をコードポイント位置に直す
function toCodePoint(text: string, utf16: number): number {
  return Array.from(text.slice(0, utf16)).length;
}

export function detectLocal(text: string): Finding[] {
  const out: Finding[] = [];
  for (const rule of LOCAL_RULES) {
    for (const m of text.matchAll(rule.re)) {
      if (rule.validate && !rule.validate(m[0])) continue;
      const start = toCodePoint(text, m.index);
      out.push({ entity: rule.entity, start, end: start + Array.from(m[0]).length, score: rule.score, engine: "local" });
    }
  }
  return out;
}

type PresidioResult = { entity_type: string; start: number; end: number; score: number };

export async function detectPresidio(text: string): Promise<Finding[]> {
  const res = await fetch(`${config.presidioUrl}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      language: "en",
      entities: config.presidioEntities,
      score_threshold: 0.5,
    }),
    signal: AbortSignal.timeout(config.guardTimeoutMs),
  });
  if (!res.ok) throw new Error(`presidio ${res.status}`);
  const results = (await res.json()) as PresidioResult[];
  return results.map((r) => ({ entity: r.entity_type, start: r.start, end: r.end, score: r.score, engine: "presidio" }));
}

export type PiiResult = { findings: Finding[]; engines: string[]; presidioError?: string };

export async function detectPii(text: string): Promise<PiiResult> {
  const findings = detectLocal(text);
  const engines = ["local"];
  let presidioError: string | undefined;
  if (config.presidioUrl) {
    try {
      findings.push(...(await detectPresidio(text)));
      engines.push("presidio");
    } catch (e) {
      // Presidio が落ちていても独自ルールだけで続ける（fail-open。理由はトレースに残す）
      presidioError = (e as Error).message;
    }
  }
  return { findings, engines, presidioError };
}

// 重なった検出をまとめて <ENTITY> に置き換える
export function mask(text: string, findings: Finding[]): string {
  if (findings.length === 0) return text;
  const chars = Array.from(text);
  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Finding[] = [];
  for (const f of sorted) {
    const last = merged[merged.length - 1];
    if (last && f.start < last.end) {
      if (f.end > last.end) last.end = f.end;
    } else {
      merged.push({ ...f });
    }
  }
  let out = "";
  let pos = 0;
  for (const f of merged) {
    out += chars.slice(pos, f.start).join("") + `<${f.entity}>`;
    pos = f.end;
  }
  return out + chars.slice(pos).join("");
}

// プロンプトインジェクションの典型パターン（日本語・英語）
export const INJECTION_RULES: { id: string; re: RegExp }[] = [
  { id: "ignore-instructions-en", re: /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|all|earlier)\b.{0,20}\b(instructions?|prompts?|rules?)\b/i },
  { id: "ignore-instructions-ja", re: /(これまで|以前|上記|前|今まで|最初)の?.{0,10}(指示|命令|ルール|プロンプト|設定).{0,6}(無視|忘れ|破棄|リセット)/ },
  { id: "reveal-system-prompt", re: /(system\s*prompt|システム\s*プロンプト|初期(設定|指示)).{0,12}(show|reveal|print|教え|表示|出力|見せ|開示)/i },
  { id: "role-override", re: /\b(you are now|act as|pretend to be)\b|(あなたは|お前は)(今から|これから).{0,20}(として|になりきって|です)/i },
  { id: "jailbreak", re: /\b(jailbreak|DAN mode|developer mode)\b|(開発者モード|脱獄|制限を(解除|外し|無視))/i },
];

export function detectInjection(text: string): string[] {
  return INJECTION_RULES.filter((r) => r.re.test(text)).map((r) => r.id);
}

export type GuardResult = {
  blocked: boolean;
  reason?: string;
  injection: string[];
  masked: string;
  pii: PiiResult;
};

export async function guardInput(text: string): Promise<GuardResult> {
  const injection = detectInjection(text);
  const pii = await detectPii(text);
  const masked = mask(text, pii.findings);
  if (injection.length > 0) {
    return { blocked: true, reason: "プロンプトインジェクションの疑いがあるため回答できません", injection, masked, pii };
  }
  return { blocked: false, injection, masked, pii };
}

export async function guardOutput(text: string): Promise<{ masked: string; pii: PiiResult }> {
  const pii = await detectPii(text);
  return { masked: mask(text, pii.findings), pii };
}
