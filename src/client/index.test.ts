import { describe, it, expect, vi } from "vitest";
import { ReeClient } from "./index";
import { Network } from "../types/network";
import type { Config } from "../types/config";

const mockConfig: Config = {
  network: Network.Testnet,
  maestroApiKey: "test-api-key",
  exchangeIdlFactory: vi.fn(),
  exchangeId: "test-id",
  exchangeCanisterId: "test-canister-id",
};

describe("ReeClient", () => {
  it("should create instance with config", () => {
    const client = new ReeClient(mockConfig);
    expect(client).toBeDefined();
    expect(client.config.network).toBe(Network.Testnet);
  });

  it("should have required methods", () => {
    const client = new ReeClient(mockConfig);
    expect(typeof client.getBtcBalance).toBe("function");
    expect(typeof client.getBtcUtxos).toBe("function");
    expect(typeof client.getRuneBalance).toBe("function");
    expect(typeof client.createTransaction).toBe("function");
  });
});
