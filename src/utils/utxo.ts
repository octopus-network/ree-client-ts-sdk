import type { Utxo } from "../types/utxo";
import type { Network } from "../types/network";
import { getScriptByAddress } from "./address";
import { bytesToHex } from "./common";

export function formatPoolUtxo(
  poolAddress: string,
  input: {
    coins: [{ id: string; value: bigint }];
    sats: bigint;
    txid: string;
    vout: number;
  },
  network: Network
): Utxo {
  const script = getScriptByAddress(poolAddress, network);
  const rune = input.coins?.[0];
  return {
    txid: input.txid,
    vout: input.vout,
    satoshis: input.sats.toString(),
    height: undefined,
    runes: rune
      ? [
          {
            id: rune.id,
            amount: rune.value.toString(),
          },
        ]
      : [],
    address: poolAddress,
    scriptPk: bytesToHex(script),
  };
}
