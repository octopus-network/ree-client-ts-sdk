import { Network } from "../types/network";

import { type Config } from "../types/config";
import { Maestro } from "../lib/maestro";
import type { Pool, PoolInfo } from "../types/pool";
import { type ActorSubclass, Actor, HttpAgent } from "@dfinity/agent";
import { Transaction } from "../lib/transaction";
import type { Utxo } from "../types/utxo";
import { bytesToHex, getScriptByAddress } from "../utils";
import type { IntentionSet } from "../types/orchestrator";
import { gql, GraphQLClient } from "graphql-request";
import type { RuneInfo } from "../types/rune";
import Decimal from "decimal.js";

import { idlFactory as orchestratorIdlFactory } from "../dids/orchestrator.did";

import {
  ORCHESTRATOR_CANISTER_ID,
  ORCHESTRATOR_CANISTER_ID_TESTNET,
  RUNES_INDEXER_URL,
  RUNES_INDEXER_URL_TESTNET,
} from "../constants";

/**
 * Main client for interacting with the Ree protocol
 * Provides methods for Bitcoin UTXO management, Rune operations, and transaction creation
 */
export class ReeClient {
  /** User's Ordinals address */
  readonly address: string;
  /** User's Bitcoin address */
  readonly paymentAddress: string;

  /** Maestro API client for Bitcoin data */
  readonly maestro: Maestro;
  /** Configuration object */
  readonly config: Config;

  /** Exchange canister actor for pool operations */
  readonly exchange: ActorSubclass;
  /** Orchestrator canister actor for transaction processing */
  readonly orchestrator: ActorSubclass;

  /**
   * Initialize ReeClient with wallet addresses and configuration
   * @param address - Bitcoin address for receiving funds
   * @param paymentAddress - Bitcoin address for sending transactions
   * @param config - Client configuration including network and API keys
   */
  constructor(address: string, paymentAddress: string, config: Config) {
    this.address = address;
    this.paymentAddress = paymentAddress;
    this.config = config;

    const isTestNet = config.network === Network.Testnet;

    // Configure Maestro API endpoint based on network
    const maestroBaseUrl = isTestNet
      ? "https://xbt-testnet.gomaestro-api.org/v0"
      : "https://xbt-mainnet.gomaestro-api.org/v0";

    this.maestro = new Maestro({
      baseUrl: maestroBaseUrl,
      apiKey: config.maestroApiKey,
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
   * Get all Bitcoin UTXOs for the payment address
   * Handles pagination automatically to fetch all available UTXOs
   * @returns Array of Bitcoin UTXOs
   */
  async getBtcUtxos(): Promise<Utxo[]> {
    let cursor = null;
    const data = [];

    // Paginate through all UTXOs
    do {
      const res = await this.maestro.utxosByAddress(
        this.paymentAddress,
        cursor
      );
      data.push(...res.data);
      cursor = res.next_cursor;
    } while (cursor !== null);

    // Transform raw UTXO data to internal format
    const btcUtxos: Utxo[] = data.map(
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

    return btcUtxos;
  }

  /**
   * Get UTXOs containing a specific rune for the user's address
   * @param runeId - The rune ID to filter UTXOs by
   * @returns Array of UTXOs containing the specified rune
   */
  async getRuneUtxos(runeId: string): Promise<Utxo[]> {
    let cursor = null;
    const data = [];

    // Paginate through all rune UTXOs for this specific rune
    do {
      const res = await this.maestro.runeUtxosByAddress(
        this.address,
        runeId,
        cursor
      );
      data.push(...res.data);
      cursor = res.next_cursor;
    } while (cursor !== null);

    // Transform and add script pubkey for each UTXO
    const runeUtxos: Utxo[] = data.map(({ txid, vout, runes, satoshis }) => {
      const scriptPk = getScriptByAddress(this.address, this.config.network);
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
    });

    return runeUtxos;
  }

  /**
   * Search for runes by keyword or rune ID
   * Supports both exact rune ID matches and fuzzy name matching
   * @param keyword - Search term (rune ID or partial name)
   * @returns Array of matching rune information
   */
  async searchRunes(keyword: string): Promise<RuneInfo[]> {
    // Select appropriate indexer URL based on network
    const runesIndexerUrl =
      this.config.network === Network.Testnet
        ? RUNES_INDEXER_URL_TESTNET
        : RUNES_INDEXER_URL;

    // GraphQL query for rune search
    const runesQuery = gql`
      query GetRunes($keyword: String!, $regex: String!) {
        runes(
          where: {
            _or: [
              { rune_id: { _eq: $keyword } }
              { spaced_rune: { _iregex: $regex } }
            ]
          }
          limit: 100
        ) {
          rune_id
          spaced_rune
          symbol
          id
          number
          etching
          divisibility
        }
      }
    `;

    const runesClient = new GraphQLClient(runesIndexerUrl);

    // Create regex pattern for fuzzy matching
    // Remove spacers and create flexible pattern
    const pattern = keyword
      .split("")
      .filter((t) => {
        if (t === "•" || t === " ") {
          return false;
        }
        return true;
      })
      .join("•?");

    // Execute GraphQL query
    const { runes } = (await runesClient.request(runesQuery, {
      keyword,
      regex: `(?i)${pattern}`,
    })) as unknown as {
      runes: {
        rune_id: string;
        symbol: string;
        spaced_rune: string;
        divisibility: number;
        etching: string;
      }[];
    };

    // Transform to internal RuneInfo format
    return runes.map(
      ({ rune_id, spaced_rune, symbol, divisibility, etching }) => ({
        runeId: rune_id,
        spacedRune: spaced_rune,
        symbol,
        divisibility,
        etching,
      })
    );
  }

  /**
   * Get detailed information for a specific rune by ID
   * @param runeId - The rune ID to look up
   * @returns Rune information or undefined if not found
   */
  async getRuneInfo(runeId: string): Promise<RuneInfo | undefined> {
    // Use search API to find exact match by rune ID
    const matchingRunes = await this.searchRunes(runeId);
    return matchingRunes[0];
  }

  /**
   * Get total Bitcoin balance from all UTXOs
   * @returns Total balance in satoshis
   */
  async getBtcBalance(): Promise<number> {
    const btcUtxos = await this.getBtcUtxos();
    const satoshis = btcUtxos.reduce(
      (total, utxo) => total + BigInt(utxo.satoshis),
      BigInt(0)
    );

    return new Decimal(satoshis.toString()).div(1e8).toNumber();
  }

  /**
   * Get the balance of a specific rune for the user's address
   * Calculates total rune amount across all UTXOs and applies divisibility
   * @param runeId - The rune ID to get balance for (format: "block:index")
   * @returns Rune balance as a number, or undefined if rune not found
   */
  async getRuneBalance(runeId: string): Promise<number | undefined> {
    const [runeUtxos, runeInfo] = await Promise.all([
      this.getRuneUtxos(runeId),
      this.getRuneInfo(runeId),
    ]);

    if (!runeUtxos || !runeInfo) {
      return undefined;
    }

    let amount = BigInt(0);
    for (const utxo of runeUtxos) {
      amount += BigInt(
        utxo.runes.find((rune) => rune.id === runeId)?.amount ?? 0
      );
    }

    return amount > BigInt(0)
      ? new Decimal(amount.toString())
          .div(Math.pow(runeInfo.divisibility, 10))
          .toNumber()
      : 0;
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
   * Supports both BTC-only and BTC-Rune swaps
   * @param params - Transaction parameters
   * @param params.runeId - Optional rune ID for rune swaps
   * @param params.poolAddress - Target pool address
   * @param params.sendBtcAmount - BTC amount to send
   * @param params.sendRuneAmount - Rune amount to send (0 for BTC-only)
   * @param params.receiveBtcAmount - Expected BTC to receive
   * @param params.receiveRuneAmount - Expected rune amount to receive
   * @returns Transaction builder instance
   */
  async createTransaction({
    runeId,
    poolAddress,
    sendBtcAmount,
    sendRuneAmount,
    receiveBtcAmount,
    receiveRuneAmount,
  }: {
    runeId?: string;
    poolAddress: string;
    sendBtcAmount: bigint;
    sendRuneAmount: bigint;
    receiveBtcAmount: bigint;
    receiveRuneAmount: bigint;
  }) {
    // Fetch required data in parallel
    const [btcUtxos, runeUtxos, poolInfo] = await Promise.all([
      this.getBtcUtxos(),
      runeId ? this.getRuneUtxos(runeId) : Promise.resolve([]),
      this.getPoolInfo(poolAddress),
    ]);

    // Transform pool UTXOs to internal format
    const poolUtxos: Utxo[] = poolInfo.utxos.map(
      ({ txid, vout, coins, sats }) => {
        const scriptPk = getScriptByAddress(poolAddress, this.config.network);
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

    // Create and return transaction builder
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

  /**
   * Submit a signed transaction to the orchestrator for execution
   * @param intentionSet - The intention set describing the transaction
   * @param signedPsbtHex - Hex-encoded signed PSBT
   * @returns Transaction result from orchestrator
   * @throws Error if transaction fails or is rejected
   */
  async invoke(intentionSet: IntentionSet, signedPsbtHex: string) {
    return (
      this.orchestrator
        .invoke({
          intention_set: intentionSet,
          initiator_utxo_proof: [],
          psbt_hex: signedPsbtHex,
        })
        // eslint-disable-next-line
        .then((data: any) => {
          if (data?.Ok) {
            return data.Ok;
          } else {
            // Parse and format error messages
            const error = data?.Err ?? {};
            const key = Object.keys(error)[0];
            const message = error[key];

            throw new Error(
              message
                ? key === "ErrorOccurredDuringExecution"
                  ? `${key}: ${
                      message.execution_steps?.[0]?.result?.Err ??
                      "Unknown Error"
                    }`
                  : `Invoke Error: ${JSON.stringify(data)}`
                : `Invoke Error: ${JSON.stringify(data)}`
            );
          }
        })
    );
  }
}
