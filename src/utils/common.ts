import * as bitcoin from "bitcoinjs-lib";
import { Network } from "../types/network";

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function toBitcoinNetwork(network: Network): bitcoin.networks.Network {
  return network === Network.Mainnet
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;
}
