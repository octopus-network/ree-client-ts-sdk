import "./polyfills";
import * as ecc from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";

bitcoin.initEccLib(ecc);
