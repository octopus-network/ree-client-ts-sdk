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
  input_coins: InputCoin[];
  output_coins: OutputCoin[];
  action: string;
  exchange_id: string;
  action_params: string;
  pool_utxo_spent: string[];
  nonce: bigint;
  pool_utxo_received: string[];
  pool_address: string;
};

export type IntentionSet = {
  tx_fee_in_sats: bigint;
  initiator_address: string;
  intentions: Intention[];
};
