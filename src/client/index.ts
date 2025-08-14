import { Network } from "../types/network";

import { type Config } from "../types/config";
import { Maestro } from "../lib/maestro";
import type { Pool, PoolInfo } from "../types/pool";
import { type ActorSubclass, Actor, HttpAgent } from "@dfinity/agent";
import { Transaction } from "../lib/transaction";
import type { Utxo } from "../types/utxo";
import { bytesToHex, getScriptByAddress } from "../utils";

import { idlFactory as orchestratorIdlFactory } from "../dids/orchestrator.did";

import {
  ORCHESTRATOR_CANISTER_ID,
  ORCHESTRATOR_CANISTER_ID_TESTNET,
} from "../constants";

export class ReeClient {
  readonly address: string;
  readonly paymentAddress: string;

  readonly maestro: Maestro;
  readonly config: Config;

  readonly exchange: ActorSubclass;
  readonly orchestrator: ActorSubclass;

  constructor(address: string, paymentAddress: string, config: Config) {
    this.address = address;
    this.paymentAddress = paymentAddress;
    this.config = config;

    const isTestNet = config.network === Network.Testnet;

    const maestroBaseUrl =
      config.network === Network.Mainnet
        ? "https://api.maestrodao.xyz"
        : "https://api.testnet.maestrodao.xyz";

    this.maestro = new Maestro({
      baseUrl: maestroBaseUrl,
      apiKey: config.maestroApiKey,
    });

    const icpHost = isTestNet ? "https://icp0.io" : "https://icp0.io";

    this.exchange = Actor.createActor(config.exchangeIdlFactory, {
      agent: HttpAgent.createSync({
        host: icpHost,
        retryTimes: 50,
        verifyQuerySignatures: false,
      }),
      canisterId: config.exchangeCanisterId,
    });

    this.orchestrator = Actor.createActor(orchestratorIdlFactory, {
      agent: HttpAgent.createSync({
        host: icpHost,
        retryTimes: 50,
        verifyQuerySignatures: false,
      }),
      canisterId: isTestNet
        ? ORCHESTRATOR_CANISTER_ID_TESTNET
        : ORCHESTRATOR_CANISTER_ID,
    });
  }

  async getBtcUtxos() {
    let cursor = null;
    const data = [];

    do {
      const res = await this.maestro.utxosByAddress(
        this.paymentAddress,
        cursor
      );
      data.push(...res.data);
      cursor = res.next_cursor;
    } while (cursor !== null);

    return data;
  }

  async getRuneUtxosByAddress(runeId: string) {
    let cursor = null;
    const data = [];

    do {
      const res = await this.maestro.runeUtxosByAddress(
        this.address,
        runeId,
        cursor
      );
      data.push(...res.data);
      cursor = res.next_cursor;
    } while (cursor !== null);

    return data;
  }

  async getPoolList() {
    try {
      const data = (await this.exchange.get_pool_list()) as Pool[];
      return data ?? [];
    } catch (err) {
      console.error("et pool list failed:", err);
      throw err;
    }
  }

  async getPoolInfo(poolAddress: string) {
    try {
      const data = (await this.exchange.get_pool_info({
        pool_address: poolAddress,
      })) as PoolInfo[];

      if (data.length === 0) {
        throw new Error("Pool not found");
      }
      return data[0];
    } catch (err) {
      console.error("get pool data failed:", err);
      throw err;
    }
  }

  async createTransaction({
    runeId,
    poolAddress,
    sendBtcAmount,
    sendRuneAmount,
    receiveBtcAmount,
    receiveRuneAmount,
  }: {
    runeId: string;
    poolAddress: string;
    sendBtcAmount: bigint;
    sendRuneAmount: bigint;
    receiveBtcAmount: bigint;
    receiveRuneAmount: bigint;
  }) {
    const [rawBtcUtxos, rawRuneUtxos, poolInfo] = await Promise.all([
      this.getBtcUtxos(),
      this.getRuneUtxosByAddress(runeId),
      this.getPoolInfo(poolAddress),
    ]);

    const btcUtxos: Utxo[] = rawBtcUtxos.map(
      ({ txid, vout, runes, satoshis, script_pubkey, address }) => ({
        txid,
        vout,
        address,
        runes: runes.map(({ rune_id, amount }) => ({
          id: rune_id,
          amount,
        })),
        satoshis,
        scriptPk: script_pubkey,
      })
    );

    const runeUtxos: Utxo[] = rawRuneUtxos.map(
      ({ txid, vout, runes, satoshis }) => {
        const scriptPk = getScriptByAddress(this.address);
        return {
          txid,
          vout,
          address: this.address,
          runes: runes.map(({ rune_id, amount }) => ({
            id: rune_id,
            amount,
          })),
          satoshis,
          scriptPk: bytesToHex(scriptPk),
        };
      }
    );

    const poolUtxos: Utxo[] = poolInfo.utxos.map(
      ({ txid, vout, coins, sats }) => {
        const scriptPk = getScriptByAddress(poolAddress);
        return {
          txid,
          vout,
          address: poolAddress,
          runes: coins.map(({ id, value }) => ({
            id,
            amount: value.toString(),
          })),
          satoshis: sats.toString(),
          scriptPk: bytesToHex(scriptPk),
        };
      }
    );

    return new Transaction(
      {
        network: this.config.network,
        address: this.address,
        paymentAddress: this.paymentAddress,
        poolAddress,
        runeId,
        sendBtcAmount,
        sendRuneAmount,
        receiveBtcAmount,
        receiveRuneAmount,
        btcUtxos,
        runeUtxos,
        poolUtxos,
      },
      this.orchestrator
    );
  }
}
