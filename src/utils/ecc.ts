import "./polyfills";
import * as ecc from "@bitcoinerlab/secp256k1";
import { initEccLib } from "bitcoinjs-lib";

initEccLib(ecc);
