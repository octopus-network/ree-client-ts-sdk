import { describe, it, expect, vi, beforeEach } from "vitest";
import "../test/setup";
import { Transaction } from "./transaction";
import { Network } from "../types/network";
import type { TransactionConfig, Intention } from "../types/transaction";
import type { Utxo } from "../types/utxo";
import { BITCOIN_ID, UTXO_DUST } from "../constants";
import { RuneId, Edict, Runestone, none } from "runelib";

// Helper to make a dummy hex string of given byte length
function hexOf(len: number) {
  return Array.from({ length: len }, () => "00").join("");
}

function makeUtxo(params: Partial<Utxo> = {}): Utxo {
  return {
    txid: params.txid ?? "txid-1",
    vout: params.vout ?? 0,
    satoshis: params.satoshis ?? "100000",
    height: params.height,
    runes: params.runes ?? [],
    address: params.address ?? "tb1quserpaymentxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    scriptPk: params.scriptPk ?? hexOf(34),
  };
}

describe("Transaction.build", () => {
  const userAddress = "tb1quserordxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // ordinals/rune address
  const paymentAddress = "tb1qpaymentxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // BTC payment address
  const poolAddress = "tb1qpoolxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

  let orchestrator: any;
  let utxoFetchers: any;

  beforeEach(() => {
    orchestrator = {
      estimate_min_tx_fee: vi.fn(async () => ({ Ok: BigInt(1000) })),
      invoke: vi.fn(async () => ({ Ok: true })),
    };

    utxoFetchers = {
      btc: vi.fn(async (addr: string) => {
        if (addr === paymentAddress) {
          // Provide enough to cover outputs + fee + dust
          return [
            makeUtxo({
              txid: "u1",
              vout: 0,
              satoshis: "120000",
              scriptPk: "001234",
              address: paymentAddress,
            }),
          ];
        }
        if (addr === poolAddress) {
          return [
            {
              txid: "u1",
              vout: 0,
              satoshis: "50000",
              scriptPk: "001234",
              address: poolAddress,
            },
          ];
        }
        return [];
      }),
      rune: vi.fn(async (_addr: string, _runeId: string) => {
        // For BTC-only test, no rune utxos are needed
        return [];
      }),
    };
  });

  function makeConfig(): TransactionConfig {
    return {
      network: Network.Testnet,
      exchangeId: "dummy-exchange",
      address: userAddress,
      paymentAddress,
    };
  }

  it("builds a PSBT for a simple BTC intention and adds inputs/outputs", async () => {
    const tx = new Transaction(makeConfig(), orchestrator, utxoFetchers);

    const depositAmount = BigInt(10_000);
    const intention: Intention = {
      poolAddress,
      inputCoins: [
        {
          coin: { id: BITCOIN_ID, value: depositAmount },
          from: paymentAddress,
        },
      ],
      outputCoins: [
        {
          coin: { id: BITCOIN_ID, value: depositAmount },
          to: poolAddress,
        },
      ],
      action: "deposit",
      nonce: BigInt(1),
    };

    tx.addIntention(intention);

    const addOutputSpy = vi.spyOn(tx as any, "addOutput");

    await tx.build();

    const poolBtcAmount = BigInt(50_000);

    expect(addOutputSpy).toHaveBeenCalledWith(
      poolAddress,
      poolBtcAmount + depositAmount
    );

    // Should add change output since 120000 - 10000 - 1000 = 109000 > DUST
    expect(addOutputSpy).toHaveBeenCalledWith(paymentAddress, BigInt(109000));
  });

  it("throws when BTC UTXOs are insufficient to cover amount+fee", async () => {
    // Provide too-small UTXO set
    utxoFetchers.btc = vi.fn(async (addr: string) => {
      if (addr === paymentAddress) {
        return [
          makeUtxo({
            satoshis: (Number(UTXO_DUST) - 1).toString(),
            address: paymentAddress,
          }),
        ];
      }
      return [];
    });

    const tx = new Transaction(makeConfig(), orchestrator, utxoFetchers);
    tx.addIntention({
      poolAddress,
      inputCoins: [
        {
          coin: { id: BITCOIN_ID, value: BigInt(5_000) },
          from: paymentAddress,
        },
      ],
      outputCoins: [],
      action: "swap",
      nonce: BigInt(2),
    });

    await expect(tx.build()).rejects.toThrow();
  });

  it("adds runestone output when rune transfers are present", async () => {
    const tx = new Transaction(makeConfig(), orchestrator, utxoFetchers);

    tx.addIntention({
      poolAddress,
      inputCoins: [],
      outputCoins: [
        {
          coin: { id: "840000:3", value: BigInt(100) },
          to: userAddress,
        },
      ],
      action: "swap",
      nonce: BigInt(3),
    });

    const addScriptOutputSpy = vi.spyOn(tx as any, "addScriptOutput");

    await tx.build();

    const runeId = new RuneId(840000, 3);

    const edicts: Edict[] = [new Edict(runeId, BigInt(100), 1)];
    const runestone = new Runestone(edicts, none(), none(), none());
    expect(addScriptOutputSpy).toHaveBeenCalledWith(
      new Uint8Array(runestone.encipher())
    );
  });
});
