export type RawBtcUtxo = {
  txid: string;
  vout: number;
  script_pubkey: string;
  satoshis: string;
  confirmations: bigint;
  height: bigint;
  runes: {
    rune_id: string;
    amount: string;
  }[];
  inscriptions: {
    offset: bigint;
    inscription_id: string;
  }[];
  address: string;
};

export type RawRuneUtxo = {
  txid: string;
  vout: number;
  satoshis: string;
  confirmations: bigint;
  height: bigint;
  runes: {
    rune_id: string;
    amount: string;
  }[];
};

export type Utxo = {
  txid: string;
  vout: number;
  satoshis: string;
  height?: number;
  runes: {
    id: string;
    amount: string;
  }[];
  address: string;
  scriptPk: string;
};
