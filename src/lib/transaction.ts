import type { TransactionConfig } from "../types/transaction";
import type { AddressType } from "../types/address";
import type { Utxo } from "../types/utxo";
import { RuneId, Edict, Runestone, none } from "runelib";
import * as bitcoin from "bitcoinjs-lib";
import { toBitcoinNetwork, getAddressType } from "../utils";
import { UTXO_DUST, BITCOIN_ID } from "../constants";
import { type ActorSubclass } from "@dfinity/agent";
import type {
  InputCoin,
  IntentionSet,
  OutputCoin,
} from "../types/orchestrator";

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

  private intentionSet: IntentionSet | null = null;

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
        value: Number(utxo.satoshis),
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    });

    this.inputAddressTypes.push(getAddressType(address));

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
      value: Number(amount),
    });
    this.outputAddressTypes.push(getAddressType(address));
  }

  /**
   * Add an OP_RETURN script output (for Runestone)
   * @param script - The script buffer to include
   */
  private addScriptOutput(script: Buffer) {
    this.psbt.addOutput({
      script,
      value: 0,
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

    if (btcAmount == BigInt(0)) {
      return selectedUtxos;
    }

    let totalAmount = BigInt(0);
    for (const utxo of btcUtxos) {
      // Skip UTXOs that contain runes (BTC-only UTXOs)
      if (utxo.runes.length) {
        continue;
      }
      if (totalAmount < btcAmount) {
        totalAmount += BigInt(utxo.satoshis);
        selectedUtxos.push(utxo);
      }
    }

    return selectedUtxos;
  }

  /**
   * Calculate rune change amount and determine if change is needed
   * @param runeId - The rune ID to calculate change for
   * @param runeUtxos - UTXOs containing the runes
   * @param runeAmount - Amount being sent
   * @returns Change calculation result
   */
  private caclulateRuneChangeAmount(
    runeId: string,
    runeUtxos: Utxo[],
    runeAmount: bigint
  ) {
    let fromRuneAmount = BigInt(0);
    let hasMultipleRunes = false;
    const runesMap: Record<string, boolean> = {};

    // Calculate total rune amount and check for multiple rune types
    runeUtxos.forEach((v) => {
      if (v.runes) {
        v.runes.forEach((w) => {
          runesMap[w.id] = true;
          if (w.id === runeId) {
            fromRuneAmount = fromRuneAmount + BigInt(w.amount);
          }
        });
      }
    });

    if (Object.keys(runesMap).length > 1) {
      hasMultipleRunes = true;
    }

    const changeRuneAmount = fromRuneAmount - runeAmount;

    // Need change if there are multiple runes or leftover amount
    const needChange = hasMultipleRunes || changeRuneAmount > 0;

    return { needChange, changeRuneAmount };
  }

  /**
   * Add rune-related outputs to the transaction
   * @param runeIdStr - Rune ID string (block:index format)
   * @param runeUtxos - UTXOs containing the runes
   * @param runeAmount - Amount of runes to transfer
   * @param receiveAddress - Address to receive the runes
   * @returns Information about whether change output is needed
   */
  private addRuneOutputs(
    runeIdStr: string,
    runeUtxos: Utxo[],
    runeAmount: bigint,
    receiveAddress: string
  ) {
    const [runeBlock, runeIndex] = runeIdStr.split(":");
    const runeId = new RuneId(Number(runeBlock), Number(runeIndex));

    // Special case: transfer all runes from UTXOs (amount = 0)
    if (runeAmount === BigInt(0) && runeUtxos.length !== 0) {
      const runeAmountAcc = runeUtxos.reduce(
        (acc, utxo) =>
          acc +
          BigInt(utxo.runes.find((r) => r.id === runeIdStr)?.amount ?? "0"),
        BigInt(0)
      );
      const runestone = new Runestone(
        [new Edict(runeId, runeAmountAcc, 1)],
        none(),
        none(),
        none()
      );

      this.addScriptOutput(runestone.encipher());
      this.addOutput(runeUtxos[0].address, UTXO_DUST);

      return { needChange: false };
    }

    const { needChange, changeRuneAmount } = this.caclulateRuneChangeAmount(
      runeIdStr,
      runeUtxos,
      runeAmount
    );

    const changeAddress = runeUtxos[0].address;

    // Create edicts for rune transfer and change
    const edicts = needChange
      ? [
          new Edict(runeId, runeAmount, 1), // Send to recipient
          new Edict(runeId, changeRuneAmount, 2), // Change back to sender
        ]
      : [new Edict(runeId, runeAmount, 1)]; // Send to recipient only

    const runestone = new Runestone(edicts, none(), none(), none());

    // Output 0: OP_RETURN with runestone
    this.addScriptOutput(runestone.encipher());

    // Output 1: Recipient gets dust + runes
    this.addOutput(receiveAddress, UTXO_DUST);

    if (needChange) {
      // Output 2: Change address gets dust + remaining runes
      this.addOutput(changeAddress, UTXO_DUST);
    }

    return {
      needChange,
    };
  }

  /**
   * Add BTC outputs and calculate transaction fees
   * @param btcUtxos - Available BTC UTXOs
   * @param btcAmount - Required BTC amount
   * @param paymentAddress - Address for change output
   * @param additionalDustNeeded - Additional dust needed for rune outputs
   * @returns Fee calculation result
   */
  private async addBtcAndFees(
    btcUtxos: Utxo[],
    btcAmount: bigint,
    paymentAddress: string,
    additionalDustNeeded: bigint = BigInt(0)
  ) {
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
        pool_address: [this.config.poolAddress],
        output_types: this.outputAddressTypes,
      })) as { Ok: bigint };

      currentFee = res.Ok + BigInt(1); // Add 1 sat buffer
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
        value: Number(changeBtcAmount),
      });
    } else if (changeBtcAmount > BigInt(0)) {
      // Small change gets discarded as additional fee
      discardedSats = changeBtcAmount;
    }

    return {
      discardedSats,
      currentFee,
    };
  }

  /**
   * Build the complete transaction
   * Handles both BTC-only and Rune transactions
   * @returns Built PSBT and total fee
   */
  async build(
    action: string,
    nonce: bigint,
    actionParams?: string
  ): Promise<bitcoin.Psbt> {
    const {
      runeId: runeIdStr,
      sendRuneAmount,
      receiveRuneAmount,
      sendBtcAmount,
      receiveBtcAmount,
      btcUtxos,
      runeUtxos,
      poolUtxos,
      address,
      paymentAddress,
      poolAddress,
    } = this.config;

    // Handle BTC-only transaction (no runeId provided)
    if (!runeIdStr || !runeUtxos?.length) {
      // Add pool UTXOs (BTC only)
      poolUtxos.forEach((utxo) => {
        this.addInput(utxo);
      });

      // Calculate total pool BTC amount
      const poolBtcAmount = poolUtxos.reduce(
        (total, utxo) => total + BigInt(utxo.satoshis),
        BigInt(0)
      );

      // Add BTC output to pool
      this.addOutput(poolAddress, poolBtcAmount + sendBtcAmount);

      // Add BTC inputs and calculate fees
      const { discardedSats, currentFee } = await this.addBtcAndFees(
        btcUtxos,
        sendBtcAmount,
        paymentAddress
      );

      const inputCoins: InputCoin[] = [
        {
          from: paymentAddress,
          coin: {
            id: BITCOIN_ID,
            value: sendBtcAmount,
          },
        },
      ];

      const outputCoins: OutputCoin[] = [];

      if (receiveBtcAmount > BigInt(0)) {
        outputCoins.push({
          to: address,
          coin: {
            id: BITCOIN_ID,
            value: receiveRuneAmount,
          },
        });
      }

      this.intentionSet = {
        tx_fee_in_sats: discardedSats + currentFee,
        initiator_address: paymentAddress,
        intentions: [
          {
            action,
            exchange_id: this.config.exchangeId,
            input_coins: inputCoins,
            pool_utxo_spent: [],
            pool_utxo_received: [],
            output_coins: outputCoins,
            pool_address: poolAddress,
            action_params: actionParams ?? "",
            nonce,
          },
        ],
      };

      return this.psbt;
    }

    // Handle Rune transaction logic
    const selectedRuneUtxos = this.selectRuneUtxos(
      runeUtxos,
      runeIdStr,
      sendRuneAmount
    );

    const isUserSendRune =
      sendRuneAmount > BigInt(0) && selectedRuneUtxos.length > 0;

    // Add user's rune UTXOs as inputs if sending runes
    if (isUserSendRune) {
      selectedRuneUtxos.forEach((utxo) => {
        this.addInput(utxo);
      });
    }

    let poolRuneAmount = BigInt(0),
      poolBtcAmount = BigInt(0);

    // Add pool UTXOs as inputs
    poolUtxos.forEach((utxo) => {
      const rune = utxo.runes.find((rune) => rune.id === runeIdStr);
      poolRuneAmount += BigInt(rune?.amount ?? "0");
      poolBtcAmount += BigInt(utxo.satoshis);
      this.addInput(utxo);
    });

    // Add rune outputs (OP_RETURN + dust outputs)
    const { needChange } = this.addRuneOutputs(
      runeIdStr,
      isUserSendRune ? selectedRuneUtxos : poolUtxos,
      isUserSendRune ? sendRuneAmount : receiveRuneAmount,
      isUserSendRune ? poolAddress : address
    );

    // Add BTC output to pool
    this.addOutput(poolAddress, poolBtcAmount + sendBtcAmount);

    // Add BTC inputs and calculate fees
    const { discardedSats, currentFee } = await this.addBtcAndFees(
      btcUtxos,
      sendBtcAmount,
      paymentAddress,
      isUserSendRune && needChange ? UTXO_DUST : BigInt(0)
    );

    const inputCoins: InputCoin[] = [];
    const outputCoins: OutputCoin[] = [];

    if (sendBtcAmount > BigInt(0)) {
      inputCoins.push({
        from: paymentAddress,
        coin: {
          id: BITCOIN_ID,
          value: sendBtcAmount,
        },
      });
    }

    if (sendRuneAmount > BigInt(0)) {
      inputCoins.push({
        from: address,
        coin: {
          id: runeIdStr,
          value: sendRuneAmount,
        },
      });
    }

    if (receiveBtcAmount > BigInt(0)) {
      outputCoins.push({
        to: paymentAddress,
        coin: {
          id: BITCOIN_ID,
          value: receiveBtcAmount,
        },
      });
    }

    if (receiveRuneAmount > BigInt(0)) {
      outputCoins.push({
        to: address,
        coin: {
          id: runeIdStr,
          value: receiveRuneAmount,
        },
      });
    }

    this.intentionSet = {
      tx_fee_in_sats: discardedSats + currentFee,
      initiator_address: paymentAddress,
      intentions: [
        {
          action,
          exchange_id: this.config.exchangeId,
          input_coins: inputCoins,
          pool_utxo_spent: [],
          pool_utxo_received: [],
          output_coins: outputCoins,
          pool_address: poolAddress,
          action_params: actionParams ?? "",
          nonce,
        },
      ],
    };

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
    if (!this.intentionSet) {
      throw new Error("Intention set not available");
    }
    return (
      this.orchestrator
        .invoke({
          intention_set: this.intentionSet,
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
