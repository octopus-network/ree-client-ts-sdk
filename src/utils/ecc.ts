import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

export { bitcoin, ecc };