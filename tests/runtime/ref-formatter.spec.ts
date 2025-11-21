import { test, expect } from "@playwright/test";
import { RefFormatter } from "../../src/utils/RefFormatter.js";

test.describe("RefFormatter", () => {
  test("toGlobal() - main frame refs have no prefix", () => {
    expect(RefFormatter.toGlobal(0, "e1")).toBe("e1");
    expect(RefFormatter.toGlobal(0, "e42")).toBe("e42");
  });

  test("toGlobal() - child frame refs have f-prefix", () => {
    expect(RefFormatter.toGlobal(1, "e1")).toBe("f1_e1");
    expect(RefFormatter.toGlobal(5, "e23")).toBe("f5_e23");
  });

  test("parse() - main frame refs", () => {
    const result = RefFormatter.parse("e1");
    expect(result.frameOrdinal).toBe(0);
    expect(result.localRef).toBe("e1");
  });

  test("parse() - child frame refs", () => {
    const result = RefFormatter.parse("f2_e15");
    expect(result.frameOrdinal).toBe(2);
    expect(result.localRef).toBe("e15");
  });

  test("parse() - throws on invalid format", () => {
    expect(() => RefFormatter.parse("invalid")).toThrow("Invalid ref format");
    expect(() => RefFormatter.parse("f_e1")).toThrow("Invalid ref format");
    expect(() => RefFormatter.parse("f1e1")).toThrow("Invalid ref format");
  });

  test("isLocal() - detects local vs global refs", () => {
    expect(RefFormatter.isLocal("e1")).toBe(true);
    expect(RefFormatter.isLocal("e999")).toBe(true);
    expect(RefFormatter.isLocal("f1_e1")).toBe(false);
    expect(RefFormatter.isLocal("f10_e5")).toBe(false);
  });

  test("getLocalRef() - extracts local portion", () => {
    expect(RefFormatter.getLocalRef("e1")).toBe("e1");
    expect(RefFormatter.getLocalRef("f5_e23")).toBe("e23");
  });
});
