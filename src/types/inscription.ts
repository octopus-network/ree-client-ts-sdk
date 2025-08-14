export type RawInscription = {
  inscription_id: string;
  satoshis: string;
  utxo_sat_offset: bigint;
  utxo_txid: string;
  utxo_vout: number;
  utxo_block_height: number;
  utxo_confirmations: string;
};
