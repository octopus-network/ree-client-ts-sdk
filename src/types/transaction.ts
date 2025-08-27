import { type Network } from "./network";
import type { Utxo } from "./utxo";

export interface TransactionConfig {
  network: Network;
  exchangeId: string;
  address: string;
  paymentAddress: string;
  btcUtxos: Utxo[];
  involvedPoolUtxos: Record<string, Utxo[]>;
  involvedRuneUtxos?: Record<string, Utxo[]>;
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
  inputCoins: CoinBalance[];
  outputCoins: CoinBalance[];
  action: string;
  actionParams?: string;
  poolAddress: string;
  nonce: bigint;
};
