import { Network } from "../types/network";

import { type Config } from "../types/config";
import { Xverse } from "../lib/xverse";
import type { Pool, PoolInfo } from "../types/pool";
import { type ActorSubclass, Actor, HttpAgent } from "@dfinity/agent";
import { Transaction } from "../lib/transaction";
import type { OutpointWithValue, Utxo } from "../types/utxo";
import { bytesToHex, getAddressType, getScriptByAddress } from "../utils";

import Decimal from "decimal.js";

import { idlFactory as orchestratorIdlFactory } from "../dids/orchestrator.did";

import {
  ORCHESTRATOR_CANISTER_ID,
  ORCHESTRATOR_CANISTER_ID_TESTNET,
} from "../constants";

/**
 * Main client for interacting with the Ree protocol
 * Provides methods for Bitcoin UTXO management, Rune operations, and transaction creation
 */
export class ReeClient {
  /** Xverse API client for Bitcoin data */
  readonly xverse: Xverse;
  /** Configuration object */
  readonly config: Config;

  /** Exchange canister actor for pool operations */
  readonly exchange: ActorSubclass;
  /** Orchestrator canister actor for transaction processing */
  readonly orchestrator: ActorSubclass;

  /**
   * Initialize ReeClient with wallet addresses and configuration
   * @param config - Client configuration including network and API keys
   */
  constructor(config: Config) {
    this.config = config;

    const isTestNet = config.network === Network.Testnet;

    // Configure Xverse API endpoint based on network
    const xverseBaseUrl = isTestNet
      ? "https://api-testnet4.secretkeylabs.io"
      : "https://api.secretkeylabs.io";

    this.xverse = new Xverse({
      baseUrl: xverseBaseUrl,
      apiKey: config.xverseApiKey,
    });

    // Configure ICP host (same for both networks currently)
    const icpHost = isTestNet ? "https://icp0.io" : "https://icp0.io";

    // Initialize exchange canister actor
    this.exchange = Actor.createActor(config.exchangeIdlFactory, {
      agent: HttpAgent.createSync({
        host: icpHost,
        retryTimes: 50,
        verifyQuerySignatures: false,
      }),
      canisterId: config.exchangeCanisterId,
    });

    // Initialize orchestrator canister actor
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

  /**
   * Filter out UTXOs that have already been spent or are being used in pending transactions
   * Queries the orchestrator to get a list of used outpoints and removes them from the UTXO set
   * @param address - The Bitcoin (or Ordinals) address to check used outpoints for
   * @param utxos - Array of UTXOs to filter
   * @returns Filtered array of UTXOs excluding spent/used ones
   */
  private async filterSpentUtxos(
    address: string,
    utxos: Utxo[],
  ): Promise<Utxo[]> {
    const usedOutpoints = (await this.orchestrator.get_used_outpoints([
      address,
    ])) as [string, string][];
    return utxos.filter(
      ({ txid, vout }) =>
        usedOutpoints.findIndex(
          ([outpoint]) => `${txid}:${vout}` === outpoint,
        ) < 0,
    );
  }

  /**
   * Get pending (zero-confirmation) Bitcoin UTXOs for a payment address
   * These are UTXOs from Ree protocol transactions that have been broadcast but not yet confirmed
   * Filters out UTXOs that contain runes to get pure Bitcoin UTXOs only
   * @param paymentAddress - The Bitcoin payment address to check for pending UTXOs
   * @returns Array of pending Bitcoin UTXOs without runes from Ree transactions
   */
  private async getPendingBtcUtxos(paymentAddress: string): Promise<Utxo[]> {
    const res = (await this.orchestrator.get_zero_confirmed_utxos_of_address(
      paymentAddress,
    )) as OutpointWithValue[];

    const addressType = getAddressType(paymentAddress);

    return res
      .filter(({ maybe_rune }) => !maybe_rune.length)
      .map(({ value, script_pubkey_hex, outpoint }) => {
        const [txid, vout] = outpoint.split(":");
        return {
          txid,
          vout: Number(vout),
          satoshis: value.toString(),
          scriptPk: script_pubkey_hex,
          addressType,
          address: paymentAddress,
          runes: [],
        };
      });
  }

  /**
   * Get pending (zero-confirmation) Rune UTXOs for an ordinals address
   * These are UTXOs from Ree protocol transactions that have been broadcast but not yet confirmed
   * Filters to include only UTXOs that contain runes
   * @param address - The ordinals address to check for pending rune UTXOs
   * @returns Array of pending UTXOs containing runes from Ree transactions
   */
  private async getPendingRuneUtxos(
    address: string,
    publicKey?: string,
  ): Promise<Utxo[]> {
    const res = (await this.orchestrator.get_zero_confirmed_utxos_of_address(
      address,
    )) as OutpointWithValue[];

    const addressType = getAddressType(address);

    return res
      .filter(({ maybe_rune }) => maybe_rune.length)
      .map(({ value, script_pubkey_hex, outpoint, maybe_rune }) => {
        const [txid, vout] = outpoint.split(":");
        const rune = maybe_rune[0];
        return {
          txid,
          vout: Number(vout),
          satoshis: value.toString(),
          scriptPk: script_pubkey_hex,
          addressType,
          address,
          runes: rune
            ? [
                {
                  id: rune.id,
                  amount: rune.value.toString(),
                },
              ]
            : [],
          pubkey: publicKey,
        };
      });
  }

  /**
   * Get all Bitcoin UTXOs for the payment address
   * Handles pagination automatically to fetch all available UTXOs
   * @returns Array of Bitcoin UTXOs
   */
  async getBtcUtxos(paymentAddress: string): Promise<Utxo[]> {
    let offset = 0;
    const limit = 60;
    const data = [];
    const pendingUtxos = await this.getPendingBtcUtxos(paymentAddress);

    // Paginate through all UTXOs
    let hasMore = true;
    while (hasMore) {
      const res = await this.xverse.utxosByAddress(
        paymentAddress,
        offset,
        limit,
      );
      data.push(...res.items);
      hasMore = res.hasMore;
      offset += limit;
    }

    // Transform raw UTXO data to internal format
    const scriptPk = getScriptByAddress(paymentAddress, this.config.network);
    const btcUtxos: Utxo[] = data
      .map(({ txid, vout, value }) => ({
        txid,
        vout,
        address: paymentAddress,
        runes: [], // Xverse BTC UTXO API doesn't include runes
        satoshis: value.toString(),
        scriptPk: bytesToHex(scriptPk),
      }))
      .filter((item) => Number(item.satoshis) > 546);

    return this.filterSpentUtxos(paymentAddress, btcUtxos.concat(pendingUtxos));
  }

  /**
   * Get UTXOs containing a specific rune for the user's address
   * @param runeId - The rune ID to filter UTXOs by
   * @returns Array of UTXOs containing the specified rune
   */
  async getRuneUtxos(
    address: string,
    runeId: string,
    publicKey?: string,
  ): Promise<Utxo[]> {
    let offset = 0;
    const limit = 60;
    const data = [];
    const pendingUtxos = await this.getPendingRuneUtxos(address, publicKey);

    // Paginate through all rune UTXOs for this specific rune
    let hasMore = true;
    while (hasMore) {
      const res = await this.xverse.runeUtxosByAddress(
        address,
        runeId,
        offset,
        limit,
      );
      data.push(...res.items);
      hasMore = res.hasMore;
      offset += limit;
    }

    // Transform and add script pubkey for each UTXO
    const scriptPk = getScriptByAddress(address, this.config.network);
    const runeUtxos: Utxo[] = data.map(({ txid, vout, runes, amount }) => {
      return {
        txid,
        vout,
        address,
        runes: runes.map(
          ({ runeId: rId, amount: runeAmount }) => {
            // Xverse returns amount as string with decimals, need to convert to raw amount
            const rawAmount = new Decimal(runeAmount).toFixed(0);

            return {
              id: rId,
              amount: rawAmount,
            };
          },
        ),
        satoshis: amount.toString(),
        scriptPk: bytesToHex(scriptPk),
        pubkey: publicKey,
      };
    });

    return this.filterSpentUtxos(address, runeUtxos.concat(pendingUtxos));
  }

  /**
   * Get total Bitcoin balance from all UTXOs
   * @returns Total balance in satoshis
   */
  async getBtcBalance(paymentAddress: string): Promise<number> {
    const btcUtxos = await this.getBtcUtxos(paymentAddress);
    const satoshis = btcUtxos.reduce(
      (total, utxo) => total + BigInt(utxo.satoshis),
      BigInt(0),
    );

    return new Decimal(satoshis.toString()).div(1e8).toNumber();
  }

  /**
   * Get the balance of a specific rune for the user's address
   * Calculates total rune amount across all UTXOs and applies divisibility
   * @param runeId - The rune ID to get balance for (format: "block:index")
   * @returns Rune balance as a number, or undefined if rune not found
   */
  async getRuneBalance(
    address: string,
    runeId: string,
    publicKey?: string,
  ): Promise<number | undefined> {
    const runeUtxos = await this.getRuneUtxos(address, runeId, publicKey);

    if (!runeUtxos) {
      return undefined;
    }

    let amount = new Decimal(0);
    for (const utxo of runeUtxos) {
      amount = amount.add(
        new Decimal(utxo.runes.find((rune) => rune.id === runeId)?.amount ?? 0),
      );
    }

    return amount.toNumber();
  }

  /**
   * Get list of all available liquidity pools
   * @returns Array of pool information
   */
  async getPoolList() {
    try {
      const data = (await this.exchange.get_pool_list()) as Pool[];
      return data ?? [];
    } catch (err) {
      console.error("get pool list failed:", err);
      throw err;
    }
  }

  /**
   * Get detailed information about a specific liquidity pool
   * @param poolAddress - The pool's Bitcoin address
   * @returns Pool information including UTXOs and balances
   * @throws Error if pool is not found
   */
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

  /**
   * Create a transaction for trading with a liquidity pool
   * @param params - Transaction parameters
   * @param params.address - Bitcoin address
   * @param params.paymentAddress - Ordinals address
   * @param params.involvedRuneId - Optional rune ID for rune swaps
   * @returns Transaction instance
   */
  async createTransaction({
    address,
    paymentAddress,
    publicKey,
    paymentPublicKey,
    feeRate,
    mergeSelfRuneBtcOutputs,
    clientInfo,
    manualBuild,
  }: {
    address: string;
    paymentAddress: string;
    publicKey?: string;
    paymentPublicKey?: string;
    feeRate?: number;
    mergeSelfRuneBtcOutputs?: boolean;
    clientInfo?: string;
    manualBuild?: boolean;
  }) {
    // Create and return transaction builder
    return new Transaction(
      {
        network: this.config.network,
        exchangeId: this.config.exchangeId,
        address,
        paymentAddress,
        publicKey,
        paymentPublicKey,
        feeRate,
        mergeSelfRuneBtcOutputs,
        clientInfo,
        manualBuild,
      },
      this,
    );
  }

  async getRecommendedFeeRate() {
    const res = (await this.orchestrator.get_status()) as {
      mempool_tx_fee_rate: {
        low: bigint;
        high: bigint;
        medium: bigint;
      };
    };

    return {
      min: Number(res.mempool_tx_fee_rate.medium),
      max: Number(res.mempool_tx_fee_rate.medium) * 3,
    };
  }
}
