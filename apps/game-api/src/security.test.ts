import { describe, expect, it } from "vitest";
import type { GameApiEnv } from "./env.js";
import { allowedOrigin, allowedRealtimeRequest } from "./security.js";

const productionEnv = {
  NODE_ENV: "production",
  PUBLIC_APP_URL: "https://bracket.famflix.live",
} as GameApiEnv;

describe("production request origins", () => {
  it("keeps HTTP mutations on the exact configured origin", () => {
    expect(allowedOrigin("https://bracket.famflix.live", productionEnv)).toBe(true);
    expect(allowedOrigin("http://localhost:3000", productionEnv)).toBe(false);
    expect(allowedOrigin(undefined, productionEnv)).toBe(false);
  });

  it("accepts originless same-host Socket.IO polling but rejects foreign hosts", () => {
    expect(allowedRealtimeRequest({ host: "bracket.famflix.live" }, productionEnv)).toBe(true);
    expect(allowedRealtimeRequest({ host: "game-api:3001", "x-forwarded-host": "bracket.famflix.live" }, productionEnv)).toBe(true);
    expect(allowedRealtimeRequest({ host: "attacker.example" }, productionEnv)).toBe(false);
    expect(allowedRealtimeRequest({ host: "bracket.famflix.live", origin: "https://attacker.example" }, productionEnv)).toBe(false);
  });
});
