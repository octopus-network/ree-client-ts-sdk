import { type Network } from "./network";
import type { Utxo } from "./utxo";

export interface TransactionConfig {
  network: Network;
  exchangeId: string;
  address: string;
  paymentAddress: string;
}

export type CoinBalance = {
  id: string;
  value: bigint;
};

export type InputCoin = {
  coin: CoinBalance;
  from: string;
};

export type OutputCoin = {
  coin: CoinBalance;
  to: string;
};

export type Intention = {
  exchangeId?: string;
  inputCoins: InputCoin[];
  outputCoins: OutputCoin[];
  action: string;
  actionParams?: string;
  poolAddress: string;
  poolUtxos?: Utxo[];
  nonce: bigint;
};
