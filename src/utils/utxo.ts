import type { Utxo } from "../types/utxo";
import { Network } from "../types/network";
import { getScriptByAddress } from "./address";
import { bytesToHex } from "./common";
import axios from "axios";

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

export async function getUtxoProof(utxos: Utxo[], network: Network) {
  try {
    const url =
      network === Network.Mainnet
        ? "https://mpc.omnity.network/utxo-status"
        : "https://mpc.omnity.network/testnet4/utxo-status";
    const res = await axios
      .post<{
        utxos: {
          txid: string;
          vout: number;
          status: number;
          value: number;
          string: string;
        }[];
        network: string;
        timestamp: number;
        signature: string;
      }>(url, utxos)
      .then((res) => res.data);

    if (!res) {
      return null;
    }
    const jsonString = JSON.stringify(res);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(jsonString);

    return Array.from(bytes);
  } catch (err) {
    return null;
  }
}
