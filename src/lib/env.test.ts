import { afterEach, describe, expect, it } from "vitest";
import {
  getPolyUrl,
  hasConfiguredPoly,
  getNansenKey,
  inMockMode,
  boolEnv,
  getSmartWalletAllowlist,
} from "./env";

afterEach(() => {
  delete process.env.POLY_SUBGRAPH_URL;
  delete process.env.POLY_API_BASE;
  delete process.env.NANSEN_API_KEY;
  delete process.env.SMART_WALLETS;
  delete process.env.USE_LIMITED_MODE;
});

describe("env helpers", () => {
  it("returns default poly url when env missing", () => {
    expect(getPolyUrl()).toBe("https://data-api.polymarket.com");
    expect(hasConfiguredPoly()).toBe(false);
  });

  it("detects configured envs", () => {
    process.env.POLY_API_BASE = "https://example.com/data";
    process.env.NANSEN_API_KEY = "abc";
    expect(getPolyUrl()).toBe("https://example.com/data");
    expect(hasConfiguredPoly()).toBe(true);
    expect(getNansenKey()).toBe("abc");
    expect(inMockMode()).toBe(false);
  });

  it("enters mock mode without nansen key", () => {
    process.env.POLY_API_BASE = "https://example.com/data";
    expect(inMockMode()).toBe(true);
  });

  it("parses boolean env values", () => {
    process.env.USE_LIMITED_MODE = "true";
    expect(boolEnv("USE_LIMITED_MODE", false)).toBe(true);
    process.env.USE_LIMITED_MODE = "off";
    expect(boolEnv("USE_LIMITED_MODE", true)).toBe(false);
  });

  it("builds smart wallet allowlist", () => {
    process.env.SMART_WALLETS = "0xabc:Alpha,0xdef";
    expect(getSmartWalletAllowlist()).toEqual([
      { address: "0xabc", label: "Alpha" },
      { address: "0xdef", label: "Smart • Allowlist" },
    ]);
  });
});
