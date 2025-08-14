import type { TransactionConfig } from "../types/transaction";

import type { AddressType } from "../types/address";
import type { Utxo } from "../types/utxo";
import { RuneId, Edict, Runestone, none } from "runelib";
import * as bitcoin from "bitcoinjs-lib";
import { toBitcoinNetwork, getAddressType } from "../utils";
import { UTXO_DUST } from "../constants";

import { type ActorSubclass } from "@dfinity/agent";

export class Transaction {
  private psbt: bitcoin.Psbt;

  private inputAddressTypes: AddressType[] = [];
  private outputAddressTypes: AddressType[] = [];

  private config: TransactionConfig;

  private userInputUtxoDusts = BigInt(0);

  readonly orchestrator: ActorSubclass;

  constructor(config: TransactionConfig, orchestrator: ActorSubclass) {
    this.config = config;

    this.psbt = new bitcoin.Psbt({
      network: toBitcoinNetwork(config.network),
    });

    this.orchestrator = orchestrator;
  }

  addInput(utxo: Utxo) {
    const { address } = utxo;

    this.psbt.data.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: BigInt(utxo.satoshis),
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    });

    this.inputAddressTypes.push(getAddressType(address));

    if (
      (address === this.config.address ||
        address === this.config.paymentAddress) &&
      utxo.runes.length !== 0
    ) {
      this.userInputUtxoDusts += BigInt(utxo.satoshis);
    }
  }

  addOutput(address: string, amount: bigint) {
    this.psbt.addOutput({
      address,
      value: amount,
    });
    this.outputAddressTypes.push(getAddressType(address));
  }

  addScriptOutput(script: Buffer) {
    this.psbt.addOutput({
      script,
      value: BigInt(0),
    });

    this.outputAddressTypes.push({ OpReturn: BigInt(script.length) });
  }

  selectRuneUtxos(runeUtxos: Utxo[], runeId: string, runeAmount: bigint) {
    const selectedUseRuneUtxos: Utxo[] = [];

    if (runeAmount == BigInt(0)) {
      return selectedUseRuneUtxos;
    }

    for (const v of runeUtxos) {
      if (v.runes.length) {
        const balance = v.runes.find((r) => r.id == runeId);
        if (balance && BigInt(balance.amount) == runeAmount) {
          selectedUseRuneUtxos.push(v);
          break;
        }
      }
    }

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

  selectBtcUtxos(btcUtxos: Utxo[], btcAmount: bigint) {
    const selectedUtxos: Utxo[] = [];

    if (btcAmount == BigInt(0)) {
      return selectedUtxos;
    }

    let totalAmount = BigInt(0);
    for (const utxo of btcUtxos) {
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

  caclulateRuneChangeAmount(
    runeId: string,
    runeUtxos: Utxo[],
    runeAmount: bigint
  ) {
    let fromRuneAmount = BigInt(0);
    let hasMultipleRunes = false;
    const runesMap: Record<string, boolean> = {};

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

    const needChange = hasMultipleRunes || changeRuneAmount > 0;

    return { needChange, changeRuneAmount };
  }

  addRuneOutputs(
    runeIdStr: string,
    runeUtxos: Utxo[],
    runeAmount: bigint,
    receiveAddress: string
  ) {
    const [runeBlock, runeIndex] = runeIdStr.split(":");

    const runeId = new RuneId(Number(runeBlock), Number(runeIndex));

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

    const edicts = needChange
      ? [
          new Edict(runeId, runeAmount, 1),
          new Edict(runeId, changeRuneAmount, 2),
        ]
      : [new Edict(runeId, runeAmount, 1)];

    const runestone = new Runestone(edicts, none(), none(), none());

    // output 0,  OP_RETURN
    this.addScriptOutput(runestone.encipher());

    // output 1
    this.addOutput(receiveAddress, UTXO_DUST);

    if (needChange) {
      // output 2
      this.addOutput(changeAddress, UTXO_DUST);
    }

    return {
      needChange,
    };
  }

  async addBtcAndFees(
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

    do {
      lastFee = currentFee;

      const res = (await this.orchestrator.estimate_min_tx_fee({
        input_types: this.inputAddressTypes,
        pool_address: [this.config.poolAddress],
        output_types: this.outputAddressTypes,
      })) as { Ok: bigint };

      currentFee = res.Ok + BigInt(1);
      targetBtcAmount =
        btcAmount + currentFee + additionalDustNeeded - this.userInputUtxoDusts;

      if (currentFee > lastFee && targetBtcAmount > 0) {
        const _selectedUtxos = this.selectBtcUtxos(btcUtxos, targetBtcAmount);

        if (_selectedUtxos.length === 0) {
          throw new Error("INSUFFICIENT_BTC_UTXOs");
        }

        this.inputAddressTypes = inputAddressTypesClone.concat([
          ..._selectedUtxos.map(() => getAddressType(paymentAddress)),
        ]);

        const totalBtcAmount = _selectedUtxos.reduce(
          (total, curr) => total + BigInt(curr.satoshis),
          BigInt(0)
        );

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

    let totalBtcAmount = BigInt(0);
    selectedUtxos.forEach((utxo) => {
      this.addInput(utxo);
      totalBtcAmount += BigInt(utxo.satoshis);
    });

    const changeBtcAmount = totalBtcAmount - targetBtcAmount;
    if (changeBtcAmount < 0) {
      throw new Error("Inssuficient UTXO(s)");
    }

    if (changeBtcAmount > UTXO_DUST) {
      this.psbt.addOutput({
        address: paymentAddress,
        value: changeBtcAmount,
      });
    } else if (changeBtcAmount > BigInt(0)) {
      discardedSats = changeBtcAmount;
    }

    return {
      discardedSats,
      currentFee,
    };
  }

  async build(): Promise<{ psbt: bitcoin.Psbt; fee: bigint }> {
    const {
      runeId: runeIdStr,
      sendRuneAmount,
      receiveRuneAmount,
      sendBtcAmount,
      btcUtxos,
      runeUtxos,
      poolUtxos,
      address,
      paymentAddress,
      poolAddress,
    } = this.config;

    const selectedRuneUtxos = this.selectRuneUtxos(
      runeUtxos,
      runeIdStr,
      sendRuneAmount
    );

    const isUserSendRune =
      sendRuneAmount > BigInt(0) && selectedRuneUtxos.length > 0;

    if (isUserSendRune) {
      selectedRuneUtxos.forEach((utxo) => {
        this.addInput(utxo);
      });
    }

    let poolRuneAmount = BigInt(0),
      poolBtcAmount = BigInt(0);

    // add pool utxo
    poolUtxos.forEach((utxo) => {
      const rune = utxo.runes.find((rune) => rune.id === runeIdStr);
      poolRuneAmount += BigInt(rune?.amount ?? "0");
      poolBtcAmount += BigInt(utxo.satoshis);
      this.addInput(utxo);
    });

    const { needChange } = this.addRuneOutputs(
      runeIdStr,
      isUserSendRune ? selectedRuneUtxos : poolUtxos,
      isUserSendRune ? sendRuneAmount : receiveRuneAmount,
      isUserSendRune ? poolAddress : address
    );

    this.addOutput(poolAddress, poolBtcAmount + sendBtcAmount);

    const { discardedSats, currentFee } = await this.addBtcAndFees(
      btcUtxos,
      sendBtcAmount,
      paymentAddress,
      isUserSendRune && needChange ? UTXO_DUST : BigInt(0)
    );

    return {
      psbt: this.psbt,
      fee: discardedSats + currentFee,
    };
  }
}
