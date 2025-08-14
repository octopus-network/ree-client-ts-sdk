import { type Network } from "./network";
import type { Utxo } from "./utxo";

export interface TransactionConfig {
  network: Network;
  address: string;
  paymentAddress: string;
  poolAddress: string;
  btcUtxos: Utxo[];
  runeUtxos: Utxo[];
  poolUtxos: Utxo[];
  runeId: string;
  sendBtcAmount: bigint;
  sendRuneAmount: bigint;
  receiveBtcAmount: bigint;
  receiveRuneAmount: bigint;
}
