import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReeClient } from "./index";
import { Network } from "../types/network";
import type { Config } from "../types/config";

// Mock dependencies
vi.mock("../lib/maestro");
vi.mock("@dfinity/agent");

const mockConfig: Config = {
  network: Network.Testnet,
  maestroApiKey: "test-api-key",
  exchangeIdlFactory: vi.fn(),
  exchangeId: "test-id",
  exchangeCanisterId: "test-canister-id",
};

describe("ReeClient", () => {
  let client: ReeClient;

  const testPaymentAddress = "bc1qpayment";

  beforeEach(() => {
    client = new ReeClient(mockConfig);
  });

  it("should create maestro instance with correct config", () => {
    expect(client.maestro).toBeDefined();
  });

  describe("getBtcUtxos", () => {
    it("should fetch and paginate UTXOs", async () => {
      const mockUtxos = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "1000",
          script_pubkey: "script1",
          confirmations: BigInt(10),
          height: BigInt(100),
          address: "addr1",
          runes: [],
          inscriptions: [],
        },
        {
          txid: "tx2",
          vout: 1,
          satoshis: "2000",
          script_pubkey: "script2",
          confirmations: BigInt(10),
          height: BigInt(100),
          address: "addr2",
          runes: [],
          inscriptions: [],
        },
      ];

      vi.spyOn(client.maestro, "utxosByAddress")
        .mockResolvedValueOnce({
          data: mockUtxos.slice(0, 1),
          next_cursor: "cursor1",
          last_updated: { block_hash: "hash", block_height: BigInt(100) },
        })
        .mockResolvedValueOnce({
          data: mockUtxos.slice(1),
          next_cursor: null,
          last_updated: { block_hash: "hash", block_height: BigInt(100) },
        });

      const result = await client.getBtcUtxos(testPaymentAddress);

      expect(result).toEqual(mockUtxos);
      expect(client.maestro.utxosByAddress).toHaveBeenCalledTimes(2);
      expect(client.maestro.utxosByAddress).toHaveBeenCalledWith(
        testPaymentAddress,
        null
      );
      expect(client.maestro.utxosByAddress).toHaveBeenCalledWith(
        testPaymentAddress,
        "cursor1"
      );
    });
  });
});
