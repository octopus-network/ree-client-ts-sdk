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

  constructor(config: TransactionConfig, orchestrator: ActorSubclass) {
    this.config = config;

    this.psbt = new bitcoin.Psbt({
      network: toBitcoinNetwork(config.network),
    });

    this.orchestrator = orchestrator;
  }

  /**
   * Add a UTXO as transaction input
   * @param utxo - The UTXO to add as input
   */
  private addInput(utxo: Utxo) {
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
  private selectBtcUtxos(btcUtxos: Utxo[], btcAmount: bigint) {
    const selectedUtxos: Utxo[] = [];

    if (btcAmount <= BigInt(0)) {
      return selectedUtxos;
    }

    let totalAmount = BigInt(0);
    for (const utxo of btcUtxos) {
      if (utxo.runes.length) {
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
      this.psbt.addOutput({
        address: paymentAddress,
        value: changeBtcAmount,
      });
    } else if (changeBtcAmount > BigInt(0)) {
      // Small change gets discarded as additional fee
      discardedSats = changeBtcAmount;
    }

    this.txFee = discardedSats + currentFee;
  }

  /**
   * Process all intentions and calculate input/output amounts for the transaction
   * This method handles multiple intentions in a single transaction, calculating:
   * - Pool UTXOs to be consumed as inputs
   * - User rune UTXOs needed for input coins
   * - Final BTC and rune amounts for all parties (user and pools)
   * 
   * @returns Object containing calculated amounts for transaction outputs
   * @throws Error if pools have insufficient funds for the requested operations
   */
  private addInputAndCalculateOutputs() {
    if (!this.intentions.length) {
      throw new Error("No intentions added");
    }

    const poolOutputBtcAmounts: Record<string, bigint> = {};
    const poolOutputRuneAmounts: Record<string, Record<string, bigint>> = {};

    let userOutputBtcAmount = BigInt(0);
    const userInputRuneAmounts: Record<string, bigint> = {};
    const userOutputRuneAmounts: Record<string, bigint> = {};

    const involvedPoolAddresses = new Set<string>();
    this.intentions.forEach((intention) => {
      involvedPoolAddresses.add(intention.poolAddress);
    });

    involvedPoolAddresses.forEach((poolAddress) => {
      const poolUtxos = this.config.involvedPoolUtxos[poolAddress] ?? [];

      poolUtxos.forEach((utxo) => {
        poolOutputBtcAmounts[poolAddress] =
          (poolOutputBtcAmounts[poolAddress] ?? BigInt(0)) +
          BigInt(utxo.satoshis);

        utxo.runes.forEach((rune) => {
          poolOutputRuneAmounts[poolAddress] ??= {};
          poolOutputRuneAmounts[poolAddress][rune.id] =
            (poolOutputRuneAmounts[poolAddress][rune.id] ?? BigInt(0)) +
            BigInt(rune.amount);
        });
        this.addInput(utxo);
      });
    });

    this.intentions.forEach((intention) => {
      const poolAddress = intention.poolAddress;

      intention.inputCoins.forEach((coin) => {
        if (coin.id === BITCOIN_ID) {
          userOutputBtcAmount -= BigInt(coin.value);
          poolOutputBtcAmounts[poolAddress] += BigInt(coin.value);
          return;
        }

        userInputRuneAmounts[coin.id] =
          (userInputRuneAmounts[coin.id] ?? BigInt(0)) + BigInt(coin.value);

        poolOutputRuneAmounts[poolAddress] ??= {};
        poolOutputRuneAmounts[poolAddress][coin.id] =
          (poolOutputRuneAmounts[poolAddress][coin.id] ?? BigInt(0)) +
          BigInt(coin.value);
      });

      intention.outputCoins.forEach((coin) => {
        if (coin.id === BITCOIN_ID) {
          userOutputBtcAmount += BigInt(coin.value);
          const newBtcBalance =
            poolOutputBtcAmounts[poolAddress] - BigInt(coin.value);

          if (newBtcBalance < BigInt(0)) {
            throw new Error(
              `Pool ${poolAddress} insufficient BTC: need ${coin.value}, have ${poolOutputBtcAmounts[poolAddress]}`
            );
          }

          poolOutputBtcAmounts[poolAddress] = newBtcBalance;
          return;
        }

        userOutputRuneAmounts[coin.id] =
          (userOutputRuneAmounts[coin.id] ?? BigInt(0)) + BigInt(coin.value);

        poolOutputRuneAmounts[poolAddress] ??= {};
        const currentRuneBalance =
          poolOutputRuneAmounts[poolAddress][coin.id] ?? BigInt(0);
        const newRuneBalance = currentRuneBalance - BigInt(coin.value);

        if (newRuneBalance < BigInt(0)) {
          throw new Error(
            `Pool ${poolAddress} insufficient rune ${coin.id}: need ${coin.value}, have ${currentRuneBalance}`
          );
        }

        poolOutputRuneAmounts[poolAddress][coin.id] = newRuneBalance;
      });
    });

    const runeIds = Object.keys(userInputRuneAmounts);
    runeIds.forEach((runeId) => {
      const requiredAmount = userInputRuneAmounts[runeId];
      if (requiredAmount <= BigInt(0)) return;

      const runeUtxos = this.selectRuneUtxos(
        this.config.involvedRuneUtxos?.[runeId] ?? [],
        runeId,
        requiredAmount
      );

      const totalRuneAmount = runeUtxos.reduce(
        (total, curr) =>
          total + BigInt(curr.runes.find((r) => r.id === runeId)?.amount ?? 0),
        BigInt(0)
      );

      const changeRuneAmount = totalRuneAmount - requiredAmount;
      if (changeRuneAmount > BigInt(0)) {
        userOutputRuneAmounts[runeId] =
          (userOutputRuneAmounts[runeId] ?? BigInt(0)) + changeRuneAmount;
      }

      runeUtxos.forEach((utxo) => {
        this.addInput(utxo);
      });
    });

    return {
      userOutputBtcAmount,
      userOutputRuneAmounts,
      poolOutputBtcAmounts,
      poolOutputRuneAmounts,
    };
  }

  private addRuneOutputs(
    userOutputRuneAmounts: Record<string, bigint>,
    poolOutputRuneAmounts: Record<string, Record<string, bigint>>,
    poolOutputBtcAmounts: Record<string, bigint>
  ) {
    const runeIdSet = new Set<string>();

    const poolAddressses = Object.keys(poolOutputBtcAmounts);

    for (const id in userOutputRuneAmounts) {
      runeIdSet.add(id);
    }
    poolAddressses.forEach((poolAddress) => {
      for (const id in poolOutputRuneAmounts[poolAddress]) {
        runeIdSet.add(id);
      }
    });

    const runeIds = Array.from(runeIdSet);

    const edicts: Edict[] = [];
    const targetAddresses: string[] = [];

    let outputIndex = 1;
    runeIds.forEach((runeIdStr: string) => {
      const runeId = new RuneId(
        Number(runeIdStr.split(":")[0]),
        Number(runeIdStr.split(":")[1])
      );

      const toUserRuneAmount = userOutputRuneAmounts[runeIdStr] ?? BigInt(0);
      if (toUserRuneAmount > BigInt(0)) {
        edicts.push(new Edict(runeId, toUserRuneAmount, outputIndex));
        targetAddresses.push(this.config.address);
        outputIndex++;
      }

      poolAddressses.forEach((poolAddress) => {
        const amount =
          poolOutputRuneAmounts[poolAddress][runeIdStr] ?? BigInt(0);
        if (amount > BigInt(0)) {
          edicts.push(new Edict(runeId, amount, outputIndex));
          targetAddresses.push(poolAddress);
          outputIndex++;
        }
      });
    });

    console.log("edicts", edicts);

    const runestone = new Runestone(edicts, none(), none(), none());
    this.addScriptOutput(new Uint8Array(runestone.encipher()));

    targetAddresses.forEach((address) => {
      let btcAmount = UTXO_DUST;
      if (!poolOutputBtcAmounts[address] || address === this.config.address) {
        this.additionalDustNeeded += UTXO_DUST;
      } else {
        btcAmount = poolOutputBtcAmounts[address];
        delete poolOutputBtcAmounts[address];
      }
      this.addOutput(address, btcAmount);
    });

    return poolOutputBtcAmounts;
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
    const {
      userOutputBtcAmount,
      userOutputRuneAmounts,
      poolOutputBtcAmounts,
      poolOutputRuneAmounts,
    } = this.addInputAndCalculateOutputs();

    console.log(
      userOutputBtcAmount,
      userOutputRuneAmounts,
      poolOutputBtcAmounts,
      poolOutputRuneAmounts
    );

    const remainPoolOutputBtcAmounts = this.addRuneOutputs(
      userOutputRuneAmounts,
      poolOutputRuneAmounts,
      poolOutputBtcAmounts
    );

    const targetBtcAddresses = Object.keys(remainPoolOutputBtcAmounts);
    targetBtcAddresses.forEach((address) => {
      this.addOutput(address, remainPoolOutputBtcAmounts[address]);
    });

    await this.addBtcAndFees(this.config.btcUtxos, -userOutputBtcAmount);

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
                input_coins: inputCoins.map((coin) => ({
                  coin,
                  from:
                    coin.id === BITCOIN_ID
                      ? this.config.paymentAddress
                      : this.config.address,
                })),
                output_coins: outputCoins.map((coin) => ({
                  coin,
                  to:
                    coin.id === BITCOIN_ID
                      ? this.config.paymentAddress
                      : this.config.address,
                })),
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
