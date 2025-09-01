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

  const richPoolAddress = "tb1qrichpoolxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

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
              runes: [],
            }),
          ];
        }
        if (addr === poolAddress) {
          return [
            {
              txid: "u3",
              vout: 0,
              satoshis: "50000",
              scriptPk: "001234",
              address: poolAddress,
              runes: [{ id: "810000:1", amount: "50000" }],
            },
          ];
        }

        if (addr === richPoolAddress) {
          return [
            {
              txid: "u1",
              vout: 0,
              satoshis: "30000",
              scriptPk: "001234",
              address: richPoolAddress,
              runes: [{ id: "840000:3", amount: "10000" }],
            },
            {
              txid: "u2",
              vout: 0,
              satoshis: "10000",
              scriptPk: "001234",
              address: richPoolAddress,
              runes: [{ id: "840000:3", amount: "5000" }],
            },
          ];
        }
        return [];
      }),
      rune: vi.fn(async (addr: string, _runeId: string) => {
        if (addr === poolAddress) {
          return [
            {
              txid: "u3",
              vout: 0,
              satoshis: "50000",
              scriptPk: "001234",
              address: poolAddress,
              runes: [{ id: "810000:1", amount: "50000" }],
            },
          ];
        }

        if (addr === richPoolAddress) {
          return [
            {
              txid: "u1",
              vout: 0,
              satoshis: "30000",
              scriptPk: "001234",
              address: richPoolAddress,
              runes: [{ id: "840000:3", amount: "10000" }],
            },
            {
              txid: "u2",
              vout: 0,
              satoshis: "10000",
              scriptPk: "001234",
              address: richPoolAddress,
              runes: [{ id: "840000:3", amount: "5000" }],
            },
          ];
        }
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

  it("deposit btc to pool", async () => {
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

  it("withdraw btc from pool", async () => {
    const tx = new Transaction(makeConfig(), orchestrator, utxoFetchers);

    const withdrawAmount = BigInt(10_000);
    const intention: Intention = {
      poolAddress,
      inputCoins: [
        {
          coin: { id: BITCOIN_ID, value: withdrawAmount },
          from: poolAddress,
        },
      ],
      outputCoins: [
        {
          coin: { id: BITCOIN_ID, value: withdrawAmount },
          to: paymentAddress,
        },
      ],
      action: "withdraw",
      nonce: BigInt(234),
    };

    tx.addIntention(intention);

    const addOutputSpy = vi.spyOn(tx as any, "addOutput");

    await tx.build();

    const poolBtcAmount = BigInt(50_000);

    expect(addOutputSpy).toHaveBeenCalledWith(
      poolAddress,
      poolBtcAmount - withdrawAmount
    );

    // Should add change output 10000 - 1000(tx fee) = 9000
    expect(addOutputSpy).toHaveBeenCalledWith(paymentAddress, BigInt(9000));

    expect(addOutputSpy).toHaveBeenCalledWith(
      poolAddress,
      poolBtcAmount - withdrawAmount
    );
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

  it("swap some btc to rune", async () => {
    const tx = new Transaction(makeConfig(), orchestrator, utxoFetchers);

    const inputBtcAmount = BigInt(100);
    const outRuneAmount = BigInt(12_000);
    const richPoolRuneAmount = BigInt(15_000);

    tx.addIntention({
      poolAddress: richPoolAddress,
      inputCoins: [
        {
          coin: { id: "0:0", value: inputBtcAmount },
          from: paymentAddress,
        },
        {
          coin: { id: "840000:3", value: outRuneAmount },
          from: richPoolAddress,
        },
      ],
      outputCoins: [
        {
          coin: { id: "840000:3", value: outRuneAmount },
          to: userAddress,
        },
        {
          coin: { id: "0:0", value: inputBtcAmount },
          to: richPoolAddress,
        },
      ],
      action: "swap",
      nonce: BigInt(3),
    });

    const addScriptOutputSpy = vi.spyOn(tx as any, "addScriptOutput");

    await tx.build();

    const runeId = new RuneId(840000, 3);

    const edicts: Edict[] = [
      new Edict(runeId, outRuneAmount, 1),
      new Edict(runeId, richPoolRuneAmount - outRuneAmount, 2),
    ];
    const runestone = new Runestone(edicts, none(), none(), none());
    expect(addScriptOutputSpy).toHaveBeenCalledWith(
      new Uint8Array(runestone.encipher())
    );
  });

  it("extract_protocol_fee and donate to rich pool", async () => {
    const tx = new Transaction(makeConfig(), orchestrator, utxoFetchers);

    const protocolFee = BigInt(100);

    tx.addIntention({
      poolAddress,
      inputCoins: [],
      outputCoins: [
        {
          coin: { id: "0:0", value: protocolFee },
          to: richPoolAddress,
        },
      ],
      action: "extract_protocol_fee",
      nonce: BigInt(1),
    });

    tx.addIntention({
      poolAddress: richPoolAddress,
      inputCoins: [
        {
          coin: { id: "0:0", value: protocolFee },
          from: poolAddress,
        },
      ],
      outputCoins: [],
      action: "donate",
      nonce: BigInt(2),
    });

    const addOutputSpy = vi.spyOn(tx as any, "addOutput");
    const addScriptOutputSpy = vi.spyOn(tx as any, "addScriptOutput");
    await tx.build();

    const richPoolBtcAmount = BigInt(40000);
    const richPoolRuneAmount = BigInt(15_000);

    expect(addOutputSpy).toHaveBeenCalledWith(
      richPoolAddress,
      richPoolBtcAmount + protocolFee
    );

    const runeId = new RuneId(840000, 3);

    const edicts: Edict[] = [new Edict(runeId, richPoolRuneAmount, 1)];
    const runestone = new Runestone(edicts, none(), none(), none());
    expect(addScriptOutputSpy).toHaveBeenCalledWith(
      new Uint8Array(runestone.encipher())
    );
  });
});
