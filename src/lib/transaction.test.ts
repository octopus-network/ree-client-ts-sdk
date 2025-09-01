import { describe, it, expect, vi, beforeEach } from "vitest";
import { Transaction } from "./transaction";
import { Network } from "../types/network";
import type { TransactionConfig } from "../types/transaction";
import type { Utxo } from "../types/utxo";

// Mock dependencies
// vi.mock("bitcoinjs-lib");
vi.mock("runelib");

const mockConfig: TransactionConfig = {
  network: Network.Testnet,
  address: "tb1quser123",
  paymentAddress: "tb1qpayment123",
  exchangeId: "test-exchange",
};

const mockOrchestrator = {
  estimate_min_tx_fee: vi.fn(),
} as any;

const mockUtxoFetchers = {
  btc: vi.fn(),
  rune: vi.fn(),
};

describe("Transaction.addBtcAndFees", () => {
  let transaction: Transaction;

  beforeEach(() => {
    vi.clearAllMocks();
    transaction = new Transaction(
      mockConfig,
      mockOrchestrator,
      mockUtxoFetchers
    );
  });

  describe("User needs to pay BTC (positive btcAmount)", () => {
    it("should select sufficient UTXOs and calculate fees", async () => {
      // Mock fee estimation
      mockOrchestrator.estimate_min_tx_fee.mockResolvedValue({
        Ok: BigInt(1000),
      });

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "200000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
        {
          txid: "tx2",
          vout: 1,
          satoshis: "300000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      const addOutputSpy = vi.spyOn(transaction as any, "addOutput");

      // User needs to pay 150000 sats
      await transaction["addBtcAndFees"](mockUtxos, BigInt(150000));

      // Should select first UTXO (200000 sats) which is sufficient
      // Should add change output since 200000 - 150000 - 1000 = 49000 > DUST

      expect(addOutputSpy).toHaveBeenCalledWith(
        mockConfig.paymentAddress,
        BigInt(49000)
      );
    });

    it("should select multiple UTXOs when single UTXO insufficient", async () => {
      mockOrchestrator.estimate_min_tx_fee.mockResolvedValue({
        Ok: BigInt(2000),
      });

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "100000", // Not enough alone
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
        {
          txid: "tx2",
          vout: 1,
          satoshis: "200000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      // User needs to pay 250000 sats
      await transaction["addBtcAndFees"](mockUtxos, BigInt(250000));

      // Should select both UTXOs (total 300000 sats)
      expect(mockOrchestrator.estimate_min_tx_fee).toHaveBeenCalled();
    });

    it("should throw error when insufficient UTXOs", async () => {
      mockOrchestrator.estimate_min_tx_fee.mockResolvedValue({
        Ok: BigInt(1000),
      });

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "50000", // Too small
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      await expect(
        transaction["addBtcAndFees"](mockUtxos, BigInt(100000))
      ).rejects.toThrow("Insufficient BTC UTXOs");
    });
  });

  describe("User receives BTC (negative btcAmount)", () => {
    it("should only pay fees when user receives BTC", async () => {
      mockOrchestrator.estimate_min_tx_fee.mockResolvedValue({
        Ok: BigInt(1500),
      });

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "100000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      // User receives 50000 sats (negative amount)
      await transaction["addBtcAndFees"](mockUtxos, BigInt(-50000));

      // Should only need to cover fees (1500 sats)
      expect(mockOrchestrator.estimate_min_tx_fee).toHaveBeenCalled();
    });
  });

  describe("Zero BTC amount (only fees)", () => {
    it("should only select UTXOs for fees", async () => {
      mockOrchestrator.estimate_min_tx_fee.mockResolvedValue({
        Ok: BigInt(800),
      });

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "50000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      await transaction["addBtcAndFees"](mockUtxos, BigInt(0));

      expect(mockOrchestrator.estimate_min_tx_fee).toHaveBeenCalled();
      // Should select UTXO to cover 800 sats fee
      // Should add change output: 50000 - 800 = 49200 > DUST
    });
  });

  describe("Fee iteration logic", () => {
    it("should iterate until fee converges", async () => {
      // Mock fee estimation to return different values on subsequent calls
      mockOrchestrator.estimate_min_tx_fee
        .mockResolvedValueOnce({ Ok: BigInt(1000) })
        .mockResolvedValueOnce({ Ok: BigInt(1200) })
        .mockResolvedValueOnce({ Ok: BigInt(1200) }); // Converged

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "100000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
        {
          txid: "tx2",
          vout: 1,
          satoshis: "200000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      await transaction["addBtcAndFees"](mockUtxos, BigInt(50000));

      // Should call estimate_min_tx_fee multiple times until convergence
      expect(mockOrchestrator.estimate_min_tx_fee).toHaveBeenCalledTimes(3);
    });
  });

  describe("Change output handling", () => {
    it("should add change output when change > DUST", async () => {
      mockOrchestrator.estimate_min_tx_fee.mockResolvedValue({
        Ok: BigInt(1000),
      });

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "100000",
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      const addOutputSpy = vi.spyOn(transaction as any, "addOutput");

      await transaction["addBtcAndFees"](mockUtxos, BigInt(10000));

      // Change = 100000 - 10000 - 1000 = 89000 > DUST
      expect(addOutputSpy).toHaveBeenCalledWith(
        mockConfig.paymentAddress,
        BigInt(89000)
      );
    });

    it("should not add change output when change <= DUST", async () => {
      mockOrchestrator.estimate_min_tx_fee.mockResolvedValue({
        Ok: BigInt(1000),
      });

      const mockUtxos: Utxo[] = [
        {
          txid: "tx1",
          vout: 0,
          satoshis: "11500", // Small UTXO
          scriptPk: "001234",
          address: "tb1qpayment123",
          runes: [],
        },
      ];

      const addOutputSpy = vi.spyOn(transaction as any, "addOutput");

      await transaction["addBtcAndFees"](mockUtxos, BigInt(10000));

      // Change = 11500 - 10000 - 1000 = 500 <= DUST (546)
      expect(addOutputSpy).not.toHaveBeenCalled();
    });
  });
});
