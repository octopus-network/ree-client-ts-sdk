import type { TransactionConfig, Intention } from "../types/transaction";
import type { AddressType } from "../types/address";
import type { Utxo } from "../types/utxo";
import { RuneId, Edict, Runestone, none } from "runelib";
import * as bitcoin from "bitcoinjs-lib";
import { toBitcoinNetwork, getAddressType, hexToBytes } from "../utils";
import { UTXO_DUST, BITCOIN_ID } from "../constants";
import { type ActorSubclass } from "@dfinity/agent";

/**
 * Transaction builder for Bitcoin and Rune transactions
 * Handles PSBT creation, UTXO selection, and fee calculation
 */
export class Transaction {
  private psbt: bitcoin.Psbt;
  private inputAddressTypes: AddressType[] = [];
  private outputAddressTypes: AddressType[] = [];
  private config: TransactionConfig;

  /** Track dust amounts from user input UTXOs for fee calculation */
  private userInputUtxoDusts = BigInt(0);

  /** Orchestrator actor for fee estimation */
  readonly orchestrator: ActorSubclass;

  private intentions: Intention[] = [];
  private txFee: bigint = BigInt(0);

  private additionalDustNeeded = BigInt(0);

  private inputUtxos: Utxo[] = [];
  private getBtcUtxos: (address: string) => Promise<Utxo[]>;
  private getRuneUtxos: (address: string, runeId: string) => Promise<Utxo[]>;

  constructor(
    config: TransactionConfig,
    orchestrator: ActorSubclass,
    utxoFetchers: {
      btc: (address: string) => Promise<Utxo[]>;
      rune: (address: string, runeId: string) => Promise<Utxo[]>;
    }
  ) {
    this.config = config;

    this.psbt = new bitcoin.Psbt({
      network: toBitcoinNetwork(config.network),
    });

    this.orchestrator = orchestrator;
    this.getBtcUtxos = utxoFetchers.btc;
    this.getRuneUtxos = utxoFetchers.rune;
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

    this.outputAddressTypes.push(getAddressType(paymentAddress));

    let lastFee = BigInt(0);
    let currentFee = BigInt(0);
    let selectedUtxos: Utxo[] = [];
    let targetBtcAmount = BigInt(0);
    let discardedSats = BigInt(0);

    const inputAddressTypesClone = [...this.inputAddressTypes];

    // Iteratively calculate fees until convergence
    do {
      lastFee = currentFee;

      // Get fee estimate from orchestrator
      const res = (await this.orchestrator.estimate_min_tx_fee({
        input_types: this.inputAddressTypes,
        pool_address: this.intentions.map((i) => i.poolAddress),
        output_types: this.outputAddressTypes,
      })) as { Ok: bigint };

      currentFee = res.Ok;
      targetBtcAmount =
        btcAmount + currentFee + additionalDustNeeded - this.userInputUtxoDusts;

      // Select UTXOs if fee increased and we need more BTC
      if (currentFee > lastFee && targetBtcAmount > 0) {
        const _selectedUtxos = this.selectBtcUtxos(btcUtxos, targetBtcAmount);

        if (_selectedUtxos.length === 0) {
          throw new Error("INSUFFICIENT_BTC_UTXOs");
        }

        // Update input types for next fee calculation
        this.inputAddressTypes = inputAddressTypesClone.concat([
          ..._selectedUtxos.map(() => getAddressType(paymentAddress)),
        ]);

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
        }

        selectedUtxos = _selectedUtxos;
      }
    } while (currentFee > lastFee && targetBtcAmount > 0);

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
            btc[address] = await this.getBtcUtxos(address);
          } catch {
            btc[address] = [];
          }
        }
        if (need.runeIds.size > 0) {
          rune[address] = {};
          await Promise.all(
            Array.from(need.runeIds).map(async (runeId) => {
              try {
                rune[address][runeId] = await this.getRuneUtxos(
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

    this.intentions.forEach(({ inputCoins, outputCoins }) => {
      inputCoins.forEach(({ coin, from }) => {
        addressInputCoinAmounts[from] ??= {};
        addressInputCoinAmounts[from][coin.id] =
          (addressInputCoinAmounts[from][coin.id] ?? BigInt(0)) +
          BigInt(coin.value);
      });

      outputCoins.forEach(({ coin, to }) => {
        addressOutputCoinAmounts[to] ??= {};
        addressOutputCoinAmounts[to][coin.id] =
          (addressOutputCoinAmounts[to][coin.id] ?? BigInt(0)) +
          BigInt(coin.value);
      });
    });

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
          selectedUtxos.forEach((utxo) => this.addInput(utxo));
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

          if (changeAmount > BigInt(0)) {
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
        !poolAddresses.includes(address)
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

  private addOutputs(
    addressReceiveCoinAmounts: Record<string, Record<string, bigint>>
  ) {
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
        const outputAmount = btcAmount > BigInt(0) ? btcAmount : UTXO_DUST;

        this.addOutput(address, outputAmount);

        // If we used the BTC amount, remove it from remaining amounts
        if (btcAmount > BigInt(0)) {
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
   * const psbt = await transaction.build();
   * const signedPsbt = await wallet.signPsbt(psbt);
   * ```
   */
  async build(): Promise<bitcoin.Psbt> {
    const addressUtxos = await this.getInvolvedAddressUtxos();

    // Get output coin amounts of addresses
    const addressOutputCoinAmounts =
      this.addInputsAndCalculateOutputs(addressUtxos);

    // Add outputs by the output coin amounts
    this.addOutputs(addressOutputCoinAmounts);

    const paymentAddress = this.config.paymentAddress;
    const userBtcUtxos = addressUtxos.btc[paymentAddress] ?? [];
    const userOutputBtcAmount =
      addressOutputCoinAmounts[paymentAddress]?.[BITCOIN_ID] ?? BigInt(0);

    await this.addBtcAndFees(userBtcUtxos, -userOutputBtcAmount);

    return this.psbt;
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
    return (
      this.orchestrator
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
                nonce,
              }) => ({
                exchange_id: this.config.exchangeId,
                input_coins: inputCoins,
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
