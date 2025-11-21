import axios, { type AxiosInstance } from "axios";
import type { RawBtcUtxo, RawRuneUtxo, RawRuneInfo } from "../types/utxo";

export class Maestro {
  private axios: AxiosInstance;

  constructor(params: { baseUrl: string; apiKey: string }) {
    this.axios = axios.create({
      baseURL: params.baseUrl,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": `${params.apiKey}`,
      },
    });
  }

  async utxosByAddress(
    address: string,
    cursor?: string | null,
    excludeMetaprotocols = true
  ) {
    const res = await this.axios
      .get<{
        next_cursor: string | null;
        last_updated: {
          block_hash: string;
          block_height: bigint;
        };
        data: RawBtcUtxo[];
      }>(
        `/addresses/${address}/utxos?filter_dust=true&filter_dust_threshold=547&exclude_metaprotocols=${excludeMetaprotocols}&ignore_used_brc20=true&order=asc&count=100${
          cursor ? `&cursor=${cursor}` : ""
        }`
      )
      .then((res) => res.data);

    return res;
  }

  async utxosByAddressMempoolAware(
    address: string,
    cursor?: string | null,
    excludeMetaprotocols = true
  ) {
    const res = await this.axios
      .get<{
        next_cursor: string | null;
        last_updated: {
          block_hash: string;
          block_height: bigint;
        };
        data: RawBtcUtxo[];
      }>(
        `/mempool/addresses/${address}/utxos?filter_dust=true&exclude_metaprotocols=${excludeMetaprotocols}&filter_dust_threshold=547&order=asc&count=100${
          cursor ? `&cursor=${cursor}` : ""
        }`
      )
      .then((res) => res.data);

    return res;
  }

  async inscriptionIdsByCollectionSymbol(
    collection: string,
    cursor?: string | null
  ) {
    const response = await this.axios
      .get<{
        next_cursor: string | null;
        last_updated: {
          block_hash: string;
          block_height: bigint;
        };
        data: string[];
      }>(
        `/assets/collections/${collection}/inscriptions?count=100${
          cursor ? `&cursor=${cursor}` : ""
        }`
      )
      .then((res) => res.data);

    return response;
  }

  async runeUtxosByAddress(
    address: string,
    rune: string,
    cursor?: string | null
  ) {
    const response = await this.axios
      .get<{
        next_cursor: string | null;
        last_updated: {
          block_hash: string;
          block_height: bigint;
        };
        data: RawRuneUtxo[];
      }>(
        `/addresses/${address}/runes/utxos?order_by=height&order=asc&count=100&rune=${rune}${
          cursor ? `&cursor=${cursor}` : ""
        }`
      )
      .then((res) => res.data);

    return response;
  }

  async runeInfo(runeId: string) {
    const response = await this.axios
      .get<{
        last_updated: {
          block_hash: string;
          block_height: bigint;
        };
        data: RawRuneInfo;
      }>(`/assets/runes/${runeId}`)
      .then((res) => res.data);

    return response;
  }
}
