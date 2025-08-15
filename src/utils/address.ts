import { AddressType } from "../types/address";
import * as bitcoin from "bitcoinjs-lib";
import { Network } from "../types/network";
import { toBitcoinNetwork } from "./common";

export function getScriptByAddress(
  address: string,
  network: Network = Network.Testnet
) {
  const bitcoinNetwork = toBitcoinNetwork(network);
  const payment = bitcoin.address.toOutputScript(address, bitcoinNetwork);
  return payment;
}

export function getAddressType(address: string): AddressType {
  const mainnet = bitcoin.networks.bitcoin;
  const testnet = bitcoin.networks.testnet;
  const regtest = bitcoin.networks.regtest;
  let decodeBase58: bitcoin.address.Base58CheckResult;
  let decodeBech32: bitcoin.address.Bech32Result;

  let addressType: AddressType = AddressType.UNKNOWN;
  if (
    address.startsWith("bc1") ||
    address.startsWith("tb1") ||
    address.startsWith("bcrt1")
  ) {
    try {
      decodeBech32 = bitcoin.address.fromBech32(address);

      if (decodeBech32.version === 0) {
        if (decodeBech32.data.length === 20) {
          addressType = AddressType.P2WPKH;
        } else {
          addressType = AddressType.P2WSH;
        }
      } else {
        addressType = AddressType.P2TR;
      }
      return addressType;
    } catch {
      return AddressType.UNKNOWN;
    }
  } else {
    try {
      decodeBase58 = bitcoin.address.fromBase58Check(address);
      if (decodeBase58.version === mainnet.pubKeyHash) {
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === testnet.pubKeyHash) {
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === regtest.pubKeyHash) {
        // do not work
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === mainnet.scriptHash) {
        addressType = AddressType.P2SH_P2WPKH;
      } else if (decodeBase58.version === testnet.scriptHash) {
        addressType = AddressType.P2SH_P2WPKH;
      } else {
        // do not work
        addressType = AddressType.P2SH_P2WPKH;
      }
      return addressType;
    } catch {
      return AddressType.UNKNOWN;
    }
  }
}
