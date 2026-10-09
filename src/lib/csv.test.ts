import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes and escapes", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"']])).toBe('a,b\r\n"x,y","say ""hi"""\r\n');
  });
  it("neutralises formula injection", () => {
    expect(toCsv(["n"], [["=HYPERLINK(\"http://x\")"], ["+1"], ["@SUM"], [-5]])).toBe("n\r\n\"'=HYPERLINK(\"\"http://x\"\")\"\r\n'+1\r\n'@SUM\r\n-5\r\n");
  });
});
