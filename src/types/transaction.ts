import { type Network } from "./network";
import type { Utxo } from "./utxo";

export interface TransactionConfig {
  network: Network;
  address: string;
  paymentAddress: string;
  poolAddress: string;
  runeId?: string;
  runeUtxos?: Utxo[];
  btcUtxos: Utxo[];
  poolUtxos: Utxo[];
  sendBtcAmount: bigint;
  sendRuneAmount: bigint;
  receiveBtcAmount: bigint;
  receiveRuneAmount: bigint;
}
