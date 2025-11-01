import type { TransactionConfig, Intention } from "../types/transaction";
import { AddressType, type AddressTypeName } from "../types/address";
import type { Utxo } from "../types/utxo";
import { RuneId, Edict, Runestone, none } from "runelib";
import * as bitcoin from "bitcoinjs-lib";
import {
  toBitcoinNetwork,
  getAddressType,
  hexToBytes,
  getUtxoProof,
} from "../utils";
import { UTXO_DUST, BITCOIN_ID } from "../constants";

import type { ReeClient } from "../client";

const INPUT_SIZE_VBYTES: Record<AddressTypeName, number> = {
  P2PKH: 148,
  P2SH_P2WPKH: 91,
  P2WPKH: 68,
  P2WSH: 140,
  P2SH: 108,
  P2TR: 58,
  UNKNOWN: 110,
};

const OUTPUT_SIZE_VBYTES: Record<AddressTypeName, number> = {
  P2PKH: 34,
  P2SH_P2WPKH: 32,
  P2WPKH: 31,
  P2WSH: 43,
  P2SH: 32,
  P2TR: 43,
  UNKNOWN: 34,
};

const SEGWIT_INPUT_TYPES = new Set<AddressTypeName>([
  "P2WPKH",
  "P2WSH",
  "P2SH_P2WPKH",
  "P2TR",
]);

const MANUAL_FEE_EXTRA_VBYTES = 2;

/**
 * Transaction builder for Bitcoin and Rune transactions
 * Handles PSBT creation, UTXO selection, and fee calculation
 */
export class Transaction {
  private psbt: bitcoin.Psbt;
  private client: ReeClient;
  private inputAddressTypes: AddressType[] = [];
  private outputAddressTypes: AddressType[] = [];
  private config: TransactionConfig;

  /** Track dust amounts from user input UTXOs for fee calculation */
  private userInputUtxoDusts = BigInt(0);

  private intentions: Intention[] = [];
  private txFee: bigint = BigInt(0);

  private additionalDustNeeded = BigInt(0);

  private inputUtxos: Utxo[] = [];

  constructor(config: TransactionConfig, client: ReeClient) {
    this.config = config;

    this.psbt = new bitcoin.Psbt({
      network: toBitcoinNetwork(config.network),
    });

    this.client = client;
  }

  /**
   * Add a UTXO as transaction input
   * @param utxo - The UTXO to add as input
   */
  private addInput(utxo: Utxo) {
    // Ignore if already added
    if (
      this.inputUtxos.findIndex(
        (i) => i.txid === utxo.txid && i.vout === utxo.vout
      ) >= 0
    ) {
      return;
    }

    const { address } = utxo;

    this.psbt.data.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: BigInt(utxo.satoshis),
        script: hexToBytes(utxo.scriptPk),
      },
    });

    this.inputAddressTypes.push(getAddressType(address));
    this.inputUtxos.push(utxo);

    // Track dust from user's rune UTXOs for fee calculation
    if (
      (address === this.config.address ||
        address === this.config.paymentAddress) &&
      utxo.runes.length !== 0
    ) {
      this.userInputUtxoDusts += BigInt(utxo.satoshis);
    }
  }

  /**
   * Add a standard output to the transaction
   * @param address - Recipient address
   * @param amount - Amount in satoshis
   */
  private addOutput(address: string, amount: bigint) {
    this.psbt.addOutput({
      address,
      value: amount,
    });
    this.outputAddressTypes.push(getAddressType(address));
  }

  /**
   * Add an OP_RETURN script output (for Runestone)
   * @param script - The script buffer to include
   */
  private addScriptOutput(script: Uint8Array) {
    this.psbt.addOutput({
      script,
      value: BigInt(0),
    });

    this.outputAddressTypes.push({ OpReturn: BigInt(script.length) });
  }

  /**
   * Select UTXOs containing specific runes for the transaction
   * @param runeUtxos - Available rune UTXOs
   * @param runeId - Target rune ID
   * @param runeAmount - Required rune amount
   * @returns Selected UTXOs that contain the required runes
   */
  private selectRuneUtxos(
    runeUtxos: Utxo[],
    runeId: string,
    runeAmount: bigint
  ) {
    const selectedUseRuneUtxos: Utxo[] = [];

    if (runeAmount == BigInt(0)) {
      return selectedUseRuneUtxos;
    }

    // First, try to find exact match
    for (const v of runeUtxos) {
      if (v.runes.length) {
        const balance = v.runes.find((r) => r.id == runeId);
        if (balance && BigInt(balance.amount) == runeAmount) {
          selectedUseRuneUtxos.push(v);
          break;
        }
      }
    }

    // If no exact match, collect UTXOs until we have enough
    if (selectedUseRuneUtxos.length == 0) {
      let total = BigInt(0);
      for (const v of runeUtxos) {
        v.runes.forEach((r) => {
          if (r.id == runeId) {
            total = total + BigInt(r.amount);
          }
        });
        selectedUseRuneUtxos.push(v);
        if (total >= runeAmount) {
          break;
        }
      }

      if (total < runeAmount) {
        throw new Error("INSUFFICIENT_RUNE_UTXOs");
      }
    }

    return selectedUseRuneUtxos;
  }

  /**
   * Select BTC UTXOs for the transaction
   * @param btcUtxos - Available BTC UTXOs
   * @param btcAmount - Required BTC amount in satoshis
   * @returns Selected UTXOs that contain enough BTC
   */
  private selectBtcUtxos(
    btcUtxos: Utxo[],
    btcAmount: bigint,
    isPoolAddress = false
  ) {
    const selectedUtxos: Utxo[] = [];

    if (btcAmount <= BigInt(0)) {
      return selectedUtxos;
    }

    let totalAmount = BigInt(0);

    for (const utxo of btcUtxos) {
      if (utxo.runes.length && !isPoolAddress) {
        continue;
      }
      totalAmount += BigInt(utxo.satoshis);
      selectedUtxos.push(utxo);

      if (totalAmount >= btcAmount) {
        break;
      }
    }

    if (totalAmount < btcAmount) {
      throw new Error(
        `Insufficient BTC UTXOs: need ${btcAmount}, have ${totalAmount}`
      );
    }

    return selectedUtxos;
  }

  /**
   * Add BTC outputs and calculate transaction fees
   * @param btcUtxos - Available BTC UTXOs
   * @param btcAmount - Required BTC amount
   * @param paymentAddress - Address for change output
   * @param additionalDustNeeded - Additional dust needed for rune outputs
   * @returns Fee calculation result
   */
  private async addBtcAndFees(btcUtxos: Utxo[], btcAmount: bigint) {
    const paymentAddress = this.config.paymentAddress;
    const additionalDustNeeded = this.additionalDustNeeded;
    const paymentAddressType = getAddressType(paymentAddress);

    const userInputUtxoDusts = this.userInputUtxoDusts;
    const manualFeeRate = this.config.feeRate;

    this.outputAddressTypes.push(paymentAddressType);
    let changePlaceholderActive = true;

    let lastFee = BigInt(0);
    let currentFee = BigInt(0);
    let selectedUtxos: Utxo[] = [];
    let targetBtcAmount = BigInt(0);
    let discardedSats = BigInt(0);

    const inputAddressTypesClone = [...this.inputAddressTypes];

    // Iteratively calculate fees until convergence
    do {
      lastFee = currentFee;

      if (manualFeeRate !== undefined) {
        const estimatedVBytes = Transaction.estimateTxVirtualSize(
          this.inputAddressTypes,
          this.outputAddressTypes
        );
        currentFee = BigInt(Math.round(manualFeeRate * estimatedVBytes));
      } else {
        // Get fee estimate from orchestrator
        const res = (await this.client.orchestrator.estimate_min_tx_fee({
          input_types: this.inputAddressTypes,
          pool_address: this.intentions.map((i) => i.poolAddress),
          output_types: this.outputAddressTypes,
        })) as { Ok: bigint };

        currentFee = res.Ok;
      }

      targetBtcAmount =
        btcAmount + currentFee + additionalDustNeeded - userInputUtxoDusts;

      // Select UTXOs if fee increased and we need more BTC
      if (currentFee > lastFee && targetBtcAmount > 0) {
        const _selectedUtxos = this.selectBtcUtxos(btcUtxos, targetBtcAmount);

        if (_selectedUtxos.length === 0) {
          throw new Error("INSUFFICIENT_BTC_UTXOs");
        }

        // Update input types for next fee calculation
        this.inputAddressTypes = inputAddressTypesClone.concat(
          _selectedUtxos.map(() => paymentAddressType)
        );

        const totalBtcAmount = _selectedUtxos.reduce(
          (total, curr) => total + BigInt(curr.satoshis),
          BigInt(0)
        );

        // Remove change output from fee calculation if change is too small
        if (
          !(
            totalBtcAmount - targetBtcAmount > 0 &&
            totalBtcAmount - targetBtcAmount > UTXO_DUST
          )
        ) {
          this.outputAddressTypes.pop();
          changePlaceholderActive = false;
        }

        selectedUtxos = _selectedUtxos;
      }
    } while (currentFee > lastFee && targetBtcAmount > 0);

    // Restore input types so addInput re-adds each payment input once
    this.inputAddressTypes = [...inputAddressTypesClone];

    // Drop the placeholder change output type if it survived the loop
    if (changePlaceholderActive) {
      this.outputAddressTypes.pop();
    }

    // Add selected UTXOs as inputs
    let totalBtcAmount = BigInt(0);
    selectedUtxos.forEach((utxo) => {
      this.addInput(utxo);
      totalBtcAmount += BigInt(utxo.satoshis);
    });

    const changeBtcAmount = totalBtcAmount - targetBtcAmount;

    if (changeBtcAmount < 0) {
      throw new Error("Insufficient UTXO(s)");
    }

    // Add change output if amount is above dust threshold
    if (changeBtcAmount > UTXO_DUST) {
      this.addOutput(paymentAddress, changeBtcAmount);
    } else if (changeBtcAmount > BigInt(0)) {
      // Small change gets discarded as additional fee
      discardedSats = changeBtcAmount;
    }

    this.txFee = discardedSats + currentFee;
  }

  /**
   * Resolve and fetch all UTXOs required by the current intention set, grouped by address.
   *
   * How it works:
   * - Scans every intention to determine, per address, whether BTC UTXOs are needed and which rune IDs are needed.
   *   • For inputCoins, uses their `from` address.
   *   • For outputCoins, uses their `to` address.
   *   • Pool address is always considered “involved” for any coin that appears in the intention.
   *   • The user's payment address is always flagged as needing BTC (to pay fees/change).
   * - Deduplicates addresses and rune IDs, then fetches UTXOs in parallel via the client:
   *   • BTC UTXOs: client.getBtcUtxos(address)
   *   • Rune UTXOs: client.getRuneUtxos(address, runeId)
   * - Any fetch error is treated as an empty list for robustness.
   *
   * Returns:
   * - An object with two maps:
   *   • btc: Record<address, Utxo[]>
   *   • rune: Record<address, Record<runeId, Utxo[]>>
   */

  private async getInvolvedAddressUtxos(): Promise<{
    btc: Record<string, Utxo[]>;
    rune: Record<string, Record<string, Utxo[]>>;
  }> {
    const btc: Record<string, Utxo[]> = {};
    const rune: Record<string, Record<string, Utxo[]>> = {};

    const needMap = new Map<
      string,
      { needBtc: boolean; runeIds: Set<string> }
    >();

    const poolAddresses = this.intentions.map((i) => i.poolAddress);

    // Payment address always needs BTC
    needMap.set(this.config.paymentAddress, {
      needBtc: true,
      runeIds: new Set(),
    });

    const ensure = (addr: string) => {
      const key = addr.trim();
      if (!needMap.has(key)) {
        needMap.set(key, { needBtc: false, runeIds: new Set() });
      }
      return needMap.get(key)!;
    };

    for (const intention of this.intentions as Intention[]) {
      for (const ic of intention.inputCoins) {
        const need = ensure(ic.from);
        if (ic.coin.id === BITCOIN_ID) {
          need.needBtc = true;
        } else {
          need.runeIds.add(ic.coin.id);
        }
      }

      for (const oc of intention.outputCoins) {
        const need = ensure(oc.to);
        if (oc.coin.id === BITCOIN_ID) {
          need.needBtc = true;
        } else {
          need.runeIds.add(oc.coin.id);
        }
      }

      const poolNeed = ensure(intention.poolAddress);
      const allCoins = [
        ...intention.inputCoins.map((c) => c.coin.id),
        ...intention.outputCoins.map((c) => c.coin.id),
      ];
      for (const id of allCoins) {
        if (id === BITCOIN_ID) {
          poolNeed.needBtc = true;
        } else {
          poolNeed.runeIds.add(id);
        }
      }
    }

    await Promise.all(
      Array.from(needMap.entries()).map(async ([address, need]) => {
        if (need.needBtc) {
          try {
            btc[address] = await this.client.getBtcUtxos(
              address,
              !poolAddresses.includes(address)
            );
          } catch {
            btc[address] = [];
          }
        }
        if (need.runeIds.size > 0) {
          rune[address] = {};
          await Promise.all(
            Array.from(need.runeIds).map(async (runeId) => {
              try {
                rune[address][runeId] = await this.client.getRuneUtxos(
                  address,
                  runeId
                );
              } catch {
                rune[address][runeId] = [];
              }
            })
          );
        }
      })
    );

    return { btc, rune };
  }

  /**
   * Select inputs (UTXOs) according to the intentions and compute the coin outputs per address.
   *
   * Inputs:
   * - addressUtxos: UTXOs grouped as returned by getInvolvedAddressUtxos().
   *
   * Algorithm (high level):
   * 1) Validate there is at least one intention.
   * 2) For each intention, ensure symmetry between inputCoins and outputCoins around the pool:
   *    - If a coin is sent from an address to the pool but not listed as output to the pool, add an output-to-pool entry.
   *    - If a coin is received from the pool by an address but not listed as input-from-pool, add an input-from-pool entry.
   * 3) Aggregate per-address input and output coin amounts (addressInputCoinAmounts, addressOutputCoinAmounts).
   * 4) For each [address, coinId] in the input amounts:
   *    - BTC (coinId === BITCOIN_ID):
   *      • If address is the user's payment address, we treat it specially by decrementing its BTC in addressOutputCoinAmounts
   *        (the actual funding and fee handling will be done later in addBtcAndFees).
   *      • Otherwise, select BTC UTXOs (preferring rune-free for non-pool addresses), add them as inputs, compute change and
   *        add that change to addressOutputCoinAmounts[address]. If the address is a pool, also credit any rune balances
   *        contained in selected pool BTC UTXOs to addressOutputCoinAmounts for later distribution.
   *    - Rune (coinId !== BITCOIN_ID): select rune UTXOs for the required runeId, add as inputs, compute rune change and add
   *      to addressOutputCoinAmounts[address].
   * 5) Ensure all pool UTXOs are included: for pool addresses that only appear on the receiving side, add all their BTC/rune
   *    UTXOs as inputs and credit their total balances into addressOutputCoinAmounts accordingly.
   *
   * Returns:
   * - addressOutputCoinAmounts: Record<address, Record<coinId, bigint>> — the final coin amounts to be sent to each address.
   */

  private addInputsAndCalculateOutputs(addressUtxos: {
    btc: Record<string, Utxo[]>;
    rune: Record<string, Record<string, Utxo[]>>;
  }) {
    if (!this.intentions.length) {
      throw new Error("No intentions added");
    }

    const poolAddresses = this.intentions.map((i) => i.poolAddress);

    const addressInputCoinAmounts: Record<string, Record<string, bigint>> = {};
    const addressOutputCoinAmounts: Record<string, Record<string, bigint>> = {};
    const passthroughPoolUtxos = new Map<string, Utxo[]>();
    const passthroughPools = new Set<string>();

    this.intentions.forEach(
      ({ poolAddress, inputCoins, outputCoins, poolUtxos }) => {
        const inputCoinsClone = [
          ...inputCoins.filter(({ from }) => !poolAddresses.includes(from)),
        ];
        const outputCoinsClone = [...outputCoins];

        inputCoinsClone.forEach(({ coin, from }) => {
          // if coin is not output to pool, add it to outputCoins
          if (
            !outputCoins.find((c) => c.coin.id === coin.id) &&
            !(poolAddresses.includes(from) && from !== poolAddress)
          ) {
            outputCoinsClone.push({
              coin,
              to: poolAddress,
            });
          }
        });

        outputCoinsClone.forEach(({ coin }) => {
          // if coin is not input from pool, add it to inputCoins
          if (!inputCoins.find((c) => c.coin.id === coin.id)) {
            inputCoinsClone.push({
              coin,
              from: poolAddress,
            });
          }
        });

        if (
          inputCoinsClone.length === 0 &&
          outputCoinsClone.length === 0 &&
          poolUtxos?.length
        ) {
          const existing = passthroughPoolUtxos.get(poolAddress);
          passthroughPoolUtxos.set(
            poolAddress,
            existing ? existing.concat(poolUtxos) : [...poolUtxos]
          );
          passthroughPools.add(poolAddress);
          return;
        }

        inputCoinsClone.forEach(({ coin, from }) => {
          addressInputCoinAmounts[from] ??= {};
          addressInputCoinAmounts[from][coin.id] =
            (addressInputCoinAmounts[from][coin.id] ?? BigInt(0)) +
            BigInt(coin.value);
        });

        outputCoinsClone.forEach(({ coin, to }) => {
          addressOutputCoinAmounts[to] ??= {};
          addressOutputCoinAmounts[to][coin.id] =
            (addressOutputCoinAmounts[to][coin.id] ?? BigInt(0)) +
            BigInt(coin.value);
        });
      }
    );

    for (const [address, utxos] of passthroughPoolUtxos.entries()) {
      if (!utxos.length) {
        continue;
      }
      addressOutputCoinAmounts[address] ??= {};
      const coinAmounts = addressOutputCoinAmounts[address];
      utxos.forEach((utxo) => {
        this.addInput(utxo);
        coinAmounts[BITCOIN_ID] =
          (coinAmounts[BITCOIN_ID] ?? BigInt(0)) + BigInt(utxo.satoshis);
        utxo.runes.forEach((rune) => {
          coinAmounts[rune.id] =
            (coinAmounts[rune.id] ?? BigInt(0)) + BigInt(rune.amount);
        });
      });
    }

    // Select UTXOs based on addressSendCoinAmounts and calculate change
    for (const [address, coinAmounts] of Object.entries(
      addressInputCoinAmounts
    )) {
      for (const [coinId, requiredAmount] of Object.entries(coinAmounts)) {
        if (coinId === BITCOIN_ID) {
          if (address === this.config.paymentAddress) {
            addressOutputCoinAmounts[address] ??= {};
            addressOutputCoinAmounts[address][coinId] =
              (addressOutputCoinAmounts[address][coinId] ?? BigInt(0)) -
              requiredAmount;

            continue;
          }

          // Select BTC UTXOs
          const btcUtxos = addressUtxos.btc[address] || [];
          const selectedUtxos = this.selectBtcUtxos(
            btcUtxos,
            requiredAmount,
            poolAddresses.includes(address)
          );

          // Calculate total input amount
          const totalInputAmount = selectedUtxos.reduce(
            (total, utxo) => total + BigInt(utxo.satoshis),
            BigInt(0)
          );

          // Calculate change
          const changeAmount = totalInputAmount - requiredAmount;

          if (changeAmount > BigInt(0)) {
            addressOutputCoinAmounts[address] ??= {};
            addressOutputCoinAmounts[address][coinId] =
              (addressOutputCoinAmounts[address][coinId] ?? BigInt(0)) +
              changeAmount;
          }

          // Add as inputs
          selectedUtxos.forEach((utxo) => {
            this.addInput(utxo);
            // If pool address, add rune amounts to output coin amounts
            if (poolAddresses.includes(address)) {
              utxo.runes.forEach((rune) => {
                addressOutputCoinAmounts[address] ??= {};
                addressOutputCoinAmounts[address][rune.id] =
                  (addressOutputCoinAmounts[address][rune.id] ?? BigInt(0)) +
                  BigInt(rune.amount);
              });
            }
          });
        } else {
          // Select Rune UTXOs

          const runeUtxos = addressUtxos.rune[address]?.[coinId] || [];
          const selectedUtxos = this.selectRuneUtxos(
            runeUtxos,
            coinId,
            requiredAmount
          );

          // Calculate total input rune amount
          const totalInputRuneAmount = selectedUtxos.reduce((total, utxo) => {
            const runeBalance = utxo.runes.find((r) => r.id === coinId);
            return total + BigInt(runeBalance?.amount ?? 0);
          }, BigInt(0));

          // Calculate rune change
          const changeAmount = totalInputRuneAmount - requiredAmount;

          if (poolAddresses.includes(address)) {
            addressOutputCoinAmounts[address] ??= {};
            addressOutputCoinAmounts[address][coinId] =
              (addressOutputCoinAmounts[address][coinId] ?? BigInt(0)) -
              requiredAmount;
          } else if (changeAmount > BigInt(0)) {
            addressOutputCoinAmounts[address] ??= {};
            addressOutputCoinAmounts[address][coinId] =
              (addressOutputCoinAmounts[address][coinId] ?? BigInt(0)) +
              changeAmount;
          }

          // Add as inputs
          selectedUtxos.forEach((utxo) => this.addInput(utxo));
        }
      }
    }

    // We should add all pool utxos
    for (const [address, coinAmounts] of Object.entries(
      addressOutputCoinAmounts
    )) {
      // Skip if this address already processed as input
      if (
        addressInputCoinAmounts[address] ||
        !poolAddresses.includes(address) ||
        passthroughPools.has(address)
      ) {
        continue;
      }

      for (const [coinId] of Object.entries(coinAmounts)) {
        if (coinId === BITCOIN_ID) {
          const btcUtxos = addressUtxos.btc[address] || [];

          // Calculate total input amount
          const totalInputAmount = btcUtxos.reduce(
            (total, utxo) => total + BigInt(utxo.satoshis),
            BigInt(0)
          );

          addressOutputCoinAmounts[address] ??= {};
          addressOutputCoinAmounts[address][coinId] =
            (addressOutputCoinAmounts[address][coinId] ?? BigInt(0)) +
            totalInputAmount;

          // Add as inputs
          btcUtxos.forEach((utxo) => {
            this.addInput(utxo);
            utxo.runes.forEach((rune) => {
              addressOutputCoinAmounts[address] ??= {};
              addressOutputCoinAmounts[address][rune.id] =
                (addressOutputCoinAmounts[address][rune.id] ?? BigInt(0)) +
                BigInt(rune.amount);
            });
          });
        } else {
          const runeUtxos = addressUtxos.rune[address]?.[coinId] || [];

          // Calculate total input rune amount
          const totalInputRuneAmount = runeUtxos.reduce((total, utxo) => {
            const runeBalance = utxo.runes.find((r) => r.id === coinId);
            return total + BigInt(runeBalance?.amount ?? 0);
          }, BigInt(0));

          addressOutputCoinAmounts[address] ??= {};
          addressOutputCoinAmounts[address][coinId] =
            (addressOutputCoinAmounts[address][coinId] ?? BigInt(0)) +
            totalInputRuneAmount;

          // Add as inputs
          runeUtxos.forEach((utxo) => this.addInput(utxo));
        }
      }
    }

    return addressOutputCoinAmounts;
  }

  /**
   * Materialize outputs from the computed addressReceiveCoinAmounts.
   *
   * Steps:
   * 1) Collect all rune IDs present across recipients. If any runes are to be transferred, first build a Runestone (edicts)
   *    and add an OP_RETURN output (at index 0). Edicts reference subsequent output indices.
   * 2) For each address that receives runes, also ensure a BTC output exists at that index:
   *    - If an explicit BTC amount is provided for the address and the address is not the user's own rune address, use it.
   *    - Otherwise, add a dust-sized BTC output (UTXO_DUST) to carry the runes, and track additionalDustNeeded for fees.
   *    After using an explicit BTC amount for a rune recipient, remove it from the remaining BTC-only outputs map.
   * 3) Finally, add any remaining BTC-only outputs where amount > 0.
   *
   * Notes:
   * - Output values are bigint; scripts use Uint8Array, compatible with bitcoinjs-lib v7.
   * - Output ordering: OP_RETURN (if any) first, then rune recipients in the order we build edicts, then remaining BTC outputs.
   */

  private addOutputs(
    addressReceiveCoinAmounts: Record<string, Record<string, bigint>>
  ) {
    const mergeSelfRuneBtcOutputs =
      this.config.mergeSelfRuneBtcOutputs === true;

    // Collect all rune IDs that need to be transferred
    const runeIdSet = new Set<string>();
    for (const [, coinAmounts] of Object.entries(addressReceiveCoinAmounts)) {
      for (const coinId of Object.keys(coinAmounts)) {
        if (coinId !== BITCOIN_ID) {
          runeIdSet.add(coinId);
        }
      }
    }

    const runeIds = Array.from(runeIdSet);

    // If there are runes to transfer, create runestone and OP_RETURN output
    if (runeIds.length > 0) {
      const edicts: Edict[] = [];
      const targetAddresses: string[] = [];

      let outputIndex = 1; // Start from 1 since OP_RETURN is at index 0

      // Create edicts for each rune transfer
      runeIds.forEach((runeIdStr: string) => {
        const runeId = new RuneId(
          Number(runeIdStr.split(":")[0]),
          Number(runeIdStr.split(":")[1])
        );

        for (const [address, coinAmounts] of Object.entries(
          addressReceiveCoinAmounts
        )) {
          const runeAmount = coinAmounts[runeIdStr] ?? BigInt(0);
          if (runeAmount > BigInt(0)) {
            edicts.push(new Edict(runeId, runeAmount, outputIndex));
            targetAddresses.push(address);
            outputIndex++;
          }
        }
      });

      // Add OP_RETURN output with runestone
      const runestone = new Runestone(edicts, none(), none(), none());
      this.addScriptOutput(new Uint8Array(runestone.encipher()));

      // Add outputs for addresses that receive runes
      targetAddresses.forEach((address) => {
        const btcAmount =
          addressReceiveCoinAmounts[address]?.[BITCOIN_ID] ?? BigInt(0);
        const isSelfAddress = address === this.config.address;
        const shouldUseBtcAmount =
          btcAmount > BigInt(0) &&
          (!isSelfAddress || mergeSelfRuneBtcOutputs);
        const outputAmount = shouldUseBtcAmount ? btcAmount : UTXO_DUST;

        this.addOutput(address, outputAmount);

        // If we used the BTC amount, remove it from remaining amounts
        if (shouldUseBtcAmount) {
          delete addressReceiveCoinAmounts[address][BITCOIN_ID];
        } else {
          // Track additional dust needed for fee calculation
          this.additionalDustNeeded += UTXO_DUST;
        }
      });
    }

    // Add remaining BTC-only outputs
    for (const [address, coinAmounts] of Object.entries(
      addressReceiveCoinAmounts
    )) {
      const btcAmount = coinAmounts[BITCOIN_ID] ?? BigInt(0);
      if (btcAmount > BigInt(0)) {
        this.addOutput(address, btcAmount);
      }
    }
  }

  /**
   * Add an intention to the transaction
   * Multiple intentions can be added to create complex, atomic transactions
   *
   * @param intention - The intention object containing:
   *   - poolAddress: Target pool address
   *   - inputCoins: Coins being sent to the pool
   *   - outputCoins: Coins expected from the pool
   *   - action: Action type (swap, deposit, withdraw, etc.)
   *   - nonce: Unique identifier for this intention
   *
   * @example
   * ```typescript
   * // Add a swap intention
   * transaction.addIntention({
   *   poolAddress: "bc1q...",
   *   inputCoins: [{ id: "0:0", value: BigInt(100000) }], // Send BTC
   *   outputCoins: [{ id: "840000:3", value: BigInt(1000) }], // Receive runes
   *   action: "swap",
   *   nonce: BigInt(Date.now()),
   * });
   * ```
   */
  addIntention(intention: Intention) {
    this.intentions.push(intention);
  }

  /**
   * Build the complete PSBT with all added intentions
   * This method processes all intentions atomically and calculates:
   * - Required inputs from user and pools
   * - Output distributions to user and pools
   * - Transaction fees and change outputs
   * - Runestone for rune transfers
   *
   * @returns Promise resolving to the built PSBT ready for signing
   * @throws Error if insufficient funds or invalid intentions
   *
   * @example
   * ```typescript
   * // After adding intentions
   * const { psbt, txid } = await transaction.build();
   * const signedPsbt = await wallet.signPsbt(psbt);
   * ```
   */
  async build(): Promise<{
    psbt: bitcoin.Psbt;
    txid: string;
    fee: bigint;
  }> {
    const addressUtxos = await this.getInvolvedAddressUtxos();

    // Reset pool UTXOs if provided
    for (const it of this.intentions) {
      const pu = (it as any).poolUtxos as Utxo[];
      if (!pu) continue;
      addressUtxos.btc[it.poolAddress] = pu;
      addressUtxos.rune[it.poolAddress] = {};
      const runeMap = addressUtxos.rune[it.poolAddress];
      for (const utxo of pu) {
        for (const r of utxo.runes) (runeMap[r.id] ??= []).push(utxo);
      }
    }

    // Get output coin amounts of addresses
    const addressOutputCoinAmounts =
      this.addInputsAndCalculateOutputs(addressUtxos);

    // Add outputs by the output coin amounts
    this.addOutputs(addressOutputCoinAmounts);

    const paymentAddress = this.config.paymentAddress;
    const userBtcUtxos = addressUtxos.btc[paymentAddress] ?? [];
    const userOutputBtcAmount =
      addressOutputCoinAmounts[paymentAddress]?.[BITCOIN_ID] ?? BigInt(0);

    await this.addBtcAndFees(
      userBtcUtxos,
      userOutputBtcAmount < 0 ? -userOutputBtcAmount : BigInt(0)
    );

    //@ts-expect-error: todo
    const unsignedTx = this.psbt.__CACHE.__TX;

    const unsignedTxClone = unsignedTx.clone();

    for (let i = 0; i < this.inputUtxos.length; i++) {
      const inputUtxo = this.inputUtxos[i];

      const inputAddress = inputUtxo.address;
      if (
        inputAddress !== this.config.paymentAddress ||
        inputAddress !== this.config.address
      )
        continue;
      const redeemScript = this.psbt.data.inputs[i].redeemScript;
      const addressType = getAddressType(inputAddress);

      if (redeemScript && addressType === AddressType.P2SH_P2WPKH) {
        const finalScriptSig = bitcoin.script.compile([redeemScript]);
        unsignedTxClone.setInputScript(i, finalScriptSig);
      }
    }

    const txid = unsignedTxClone.getId();

    return {
      psbt: this.psbt,
      txid,
      fee: this.txFee,
    };
  }

  private static estimateTxVirtualSize(
    inputTypes: AddressType[],
    outputTypes: AddressType[]
  ): number {
    const inputCount = inputTypes.length;
    const outputCount = outputTypes.length;

    let totalVBytes =
      4 + // version
      4 + // locktime
      Transaction.varIntSize(inputCount) +
      Transaction.varIntSize(outputCount);

    let hasWitness = false;

    for (const addressType of inputTypes) {
      const parsed = Transaction.parseAddressType(addressType);
      if (parsed.key === "OpReturn") {
        continue;
      }

      const size =
        INPUT_SIZE_VBYTES[parsed.key as AddressTypeName] ??
        INPUT_SIZE_VBYTES.UNKNOWN;
      totalVBytes += size;

      if (SEGWIT_INPUT_TYPES.has(parsed.key as AddressTypeName)) {
        hasWitness = true;
      }
    }

    for (const addressType of outputTypes) {
      const parsed = Transaction.parseAddressType(addressType);
      if (parsed.key === "OpReturn") {
        const dataLength = Math.max(0, parsed.opReturnLength ?? 0);
        totalVBytes += 11 + dataLength;
        continue;
      }

      const size =
        OUTPUT_SIZE_VBYTES[parsed.key as AddressTypeName] ??
        OUTPUT_SIZE_VBYTES.UNKNOWN;
      totalVBytes += size;
    }

    if (hasWitness) {
      // Segwit marker + flag add 0.5 vbytes; round up to keep estimate conservative
      totalVBytes += 1;
    }

    return totalVBytes + MANUAL_FEE_EXTRA_VBYTES;
  }

  private static parseAddressType(addressType: AddressType): {
    key: AddressTypeName | "OpReturn";
    opReturnLength?: number;
  } {
    if ("OpReturn" in addressType) {
      const lengthValue =
        addressType.OpReturn !== undefined ? Number(addressType.OpReturn) : 0;
      return {
        key: "OpReturn",
        opReturnLength: Number.isFinite(lengthValue) ? lengthValue : 0,
      };
    }

    const knownKeys: AddressTypeName[] = [
      "P2PKH",
      "P2SH_P2WPKH",
      "P2WPKH",
      "P2WSH",
      "P2SH",
      "P2TR",
    ];

    for (const key of knownKeys) {
      if (key in addressType) {
        return { key };
      }
    }

    return { key: "UNKNOWN" };
  }

  private static varIntSize(value: number): number {
    if (value < 0xfd) return 1;
    if (value <= 0xffff) return 3;
    if (value <= 0xffffffff) return 5;
    return 9;
  }

  /**
   * Submit the signed transaction to the orchestrator for execution
   * This method sends the signed PSBT along with the intention set to the orchestrator canister
   *
   * @param signedPsbtHex - The signed PSBT in hexadecimal format from the user's wallet
   * @returns Promise that resolves to the orchestrator's response on success
   * @throws Error if intention set is not available or if the orchestrator returns an error
   *
   * @example
   * ```typescript
   * // After building and signing the transaction
   * const signedPsbt = await wallet.signPsbt(psbt);
   * const result = await transaction.send(signedPsbt.toHex());
   * ```
   */
  async send(signedPsbtHex: string) {
    if (!this.intentions.length) {
      throw new Error("No itentions added");
    }

    const initiatorUtxos = this.inputUtxos.filter(
      (u) =>
        u.address === this.config.paymentAddress ||
        u.address === this.config.address
    );

    const initiatorUtxoProof = await getUtxoProof(
      initiatorUtxos,
      this.config.network
    );

    if (!initiatorUtxoProof) {
      throw new Error("Failed to get utxo proof");
    }

    return (
      this.client.orchestrator
        .invoke({
          intention_set: {
            tx_fee_in_sats: this.txFee,
            initiator_address: this.config.paymentAddress,
            intentions: this.intentions.map(
              ({
                action,
                actionParams,
                poolAddress,
                inputCoins,
                outputCoins,
                exchangeId,
                nonce,
              }) => ({
                exchange_id: exchangeId ?? this.config.exchangeId,
                input_coins: inputCoins.filter((c) => c.from !== poolAddress),
                output_coins: outputCoins,
                pool_address: poolAddress,
                action,
                action_params: actionParams ?? "",
                pool_utxo_spent: [],
                pool_utxo_received: [],
                nonce,
              })
            ),
          },
          initiator_utxo_proof: initiatorUtxoProof,
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
