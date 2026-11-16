import { describe, expect, it } from "vitest";
import { NdjsonParser } from "./ndjson";

describe("NdjsonParser", () => {
  it("行の途中で切れて届いても組み立てる", () => {
    const p = new NdjsonParser();
    expect(p.push('{"type":"tok')).toEqual([]);
    expect(p.push('en","text":"あ"}\n{"type":"done"}\n')).toEqual([{ type: "token", text: "あ" }, { type: "done" }]);
  });
});
