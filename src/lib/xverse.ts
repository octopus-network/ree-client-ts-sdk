import axios, { type AxiosInstance } from "axios";

export class Xverse {
  private axios: AxiosInstance;

  constructor(params: { baseUrl: string; apiKey: string }) {
    this.axios = axios.create({
      baseURL: params.baseUrl,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": `${params.apiKey}`,
      },
    });
  }

  async utxosByAddress(address: string, offset = 0, limit = 5000) {
    const res = await this.axios
      .get<{
        hasMore: boolean;
        items: {
          txid: string;
          vout: number;
          value: number;
          status: {
            confirmed: boolean;
            blockHeight: boolean;
            blockHash: string;
            blockTime: number;
          };
        }[];
      }>(`/v2/bitcoin/address/${address}/utxo?offset=${offset}&limit=${limit}`)
      .then((res) => res.data);

    return res;
  }

  async runeUtxosByAddress(
    address: string,
    runeId: string,
    offset = 0,
    limit = 5000,
  ) {
    const res = await this.axios
      .get<{
        hasMore: boolean;
        items: {
          txid: string;
          vout: number;
          amount: number;
          blockHeight: number;
          runes: {
            runeName: string;
            runeId: string;
            amount: string;
            divisibility: number;
            symbol: string;
          }[];
        }[];
      }>(
        `/v1/runes/address/${address}/utxo?runeId=${runeId}&includeUnconfirmed=false&offset=${offset}&limit=${limit}`,
      )
      .then((res) => res.data);

    return res;
  }
}
