export const AddressType = {
  P2PKH: { P2PKH: null },
  P2SH_P2WPKH: { P2SH_P2WPKH: null },
  P2WPKH: { P2WPKH: null },
  P2WSH: { P2WSH: null },
  P2SH: { P2SH: null },
  P2TR: { P2TR: null },
  UNKNOWN: { UNKNOWN: null },
};

export type AddressType =
  | (typeof AddressType)[keyof typeof AddressType]
  | {
      OpReturn: bigint;
    };

export type AddressTypeName =
  | "P2PKH"
  | "P2SH_P2WPKH"
  | "P2WPKH"
  | "P2WSH"
  | "P2SH"
  | "P2TR"
  | "UNKNOWN";
