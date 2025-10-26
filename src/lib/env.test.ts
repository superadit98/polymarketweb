import { afterEach, describe, expect, it } from "vitest";
import { getPolyUrl, hasConfiguredPoly, getNansenKey, inMockMode } from "./env";

afterEach(() => {
  delete process.env.POLY_SUBGRAPH_URL;
  delete process.env.NANSEN_API_KEY;
});

describe("env helpers", () => {
  it("returns default poly url when env missing", () => {
    expect(getPolyUrl()).toContain("polymarket-trades");
    expect(hasConfiguredPoly()).toBe(false);
  });

  it("detects configured envs", () => {
    process.env.POLY_SUBGRAPH_URL = "https://example.com/subgraph";
    process.env.NANSEN_API_KEY = "abc";
    expect(getPolyUrl()).toBe("https://example.com/subgraph");
    expect(hasConfiguredPoly()).toBe(true);
    expect(getNansenKey()).toBe("abc");
    expect(inMockMode()).toBe(false);
  });

  it("enters mock mode without nansen key", () => {
    process.env.POLY_SUBGRAPH_URL = "https://example.com/subgraph";
    expect(inMockMode()).toBe(true);
  });
});
