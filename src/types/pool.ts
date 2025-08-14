export type Pool = {
  name: string;
  address: string;
};

export type PoolInfo = {
  address: string;
  attributes: string;
  btc_reserved: bigint;
  coin_reserved: {
    id: string;
    value: bigint;
  }[];
  key: string;
  name: string;
  nonce: bigint;
  utxos: {
    coins: { id: string; value: bigint }[];
    sats: bigint;
    txid: string;
    vout: number;
  }[];
};
