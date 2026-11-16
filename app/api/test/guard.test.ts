import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeAll, describe, expect, it } from "vitest";
import { config, positiveNumber } from "../src/config.js";
import { detectInjection, detectLocal, luhn, mask } from "../src/guard.js";
import { judge, loadCases, viaApi } from "../src/guard-check.js";

beforeAll(() => {
  // CIでは Presidio を立てないので、日本向けの独自ルールだけで判定する
  config.presidioUrl = "";
});

describe("mask", () => {
  it("検出箇所を種別名に置き換え、重なりはまとめる", () => {
    const text = "連絡先 a@b.jp まで";
    const f = detectLocal(text);
    expect(mask(text, f)).toBe("連絡先 <EMAIL_ADDRESS> まで");
    expect(
      mask("abcdef", [
        { entity: "X", start: 1, end: 4, score: 1, engine: "local" },
        { entity: "Y", start: 2, end: 5, score: 1, engine: "local" },
      ]),
    ).toBe("a<X>f");
  });

  it("サロゲートペアを含んでも位置がずれない（Presidio と同じコードポイント単位）", () => {
    const text = "😀 090-1234-5678";
    expect(mask(text, detectLocal(text))).toBe("😀 <JP_PHONE_NUMBER>");
  });
});

describe("detectLocal", () => {
  it("カード番号はチェックディジットが合うものだけ", () => {
    expect(luhn("4111111111111111")).toBe(true);
    expect(detectLocal("番号 1234 5678 9012 3456").some((f) => f.entity === "CREDIT_CARD")).toBe(false);
  });

  it("ポート番号やバージョンは電話番号にしない", () => {
    expect(detectLocal("ポート4317、v1.2.3、2026-11-16")).toEqual([]);
  });
});

describe("detectInjection", () => {
  it("「無視」を含むだけの普通の質問は通す", () => {
    expect(detectInjection("サンプリングで無視されるスパンは？")).toEqual([]);
  });
});

describe("eval/guard-cases.jsonl", () => {
  for (const c of loadCases()) {
    it(`${c.id} → ${c.expect}`, async () => {
      const r = await judge(c);
      expect({ actual: r.actual, entities: r.entities }).toMatchObject({ actual: c.expect });
      expect(r.ok, `masked: ${r.masked}`).toBe(true);
    });
  }
});

describe("positiveNumber", () => {
  it("正の有限数でなければ既定値に戻す", () => {
    expect(positiveNumber("1500", 2000)).toBe(1500);
    for (const v of [undefined, "", "abc", "0", "-1", "Infinity"]) expect(positiveNumber(v, 2000)).toBe(2000);
  });
});

describe("viaApi", () => {
  const c = { id: "x", input: "hello", expect: "pass" as const };
  const serve = (status: number, body: string) =>
    new Promise<{ url: string; close: () => void }>((ok) => {
      const s = createServer((_, res) => res.writeHead(status).end(body)).listen(0, "127.0.0.1", () => {
        const { port } = s.address() as AddressInfo;
        ok({ url: `http://127.0.0.1:${port}/chat`, close: () => s.close() });
      });
    });

  it("HTTPエラーは失敗にする", async () => {
    const srv = await serve(404, "");
    expect((await viaApi(srv.url, c)).ok).toBe(false);
    srv.close();
  });

  it("error イベントは失敗にする", async () => {
    const srv = await serve(200, '{"type":"meta","traceId":"t1"}\n{"type":"error","message":"boom"}\n');
    expect(await viaApi(srv.url, c)).toEqual({ ok: false, summary: "t1 error: boom" });
    srv.close();
  });
});
