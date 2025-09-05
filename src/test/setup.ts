import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock ECC library for testing
const mockEcc = {
  pointFromScalar: vi.fn(() => Buffer.alloc(33)),
  pointAddScalar: vi.fn(() => Buffer.alloc(33)),
  pointMultiply: vi.fn(() => Buffer.alloc(33)),
  privateAdd: vi.fn(() => Buffer.alloc(32)),
  privateSub: vi.fn(() => Buffer.alloc(32)),
  sign: vi.fn(() => Buffer.alloc(64)),
  verify: vi.fn(() => true),
  isPoint: vi.fn(() => true),
  isPrivate: vi.fn(() => true),
  pointCompress: vi.fn(() => Buffer.alloc(33)),
  pointFromX: vi.fn(() => Buffer.alloc(33)),
};

vi.mock("@bitcoinerlab/secp256k1", () => ({
  default: mockEcc,
}));

// Mock bitcoinjs-lib with working implementation
vi.mock("bitcoinjs-lib", () => {
  const mockTx = {
    clone: vi.fn(() => ({
      setInputScript: vi.fn(),
      getId: vi.fn(() => "mock-txid"),
    })),
    setInputScript: vi.fn(),
    getId: vi.fn(() => "mock-txid"),
  };

  const mockPsbtInstance = {
    data: {
      inputs: [],
      addInput: vi.fn().mockReturnThis(),
      addOutput: vi.fn().mockReturnThis(),
    },
    addInput: vi.fn().mockReturnThis(),
    addOutput: vi.fn().mockReturnThis(),
    signInput: vi.fn().mockReturnThis(),
    finalizeAllInputs: vi.fn().mockReturnThis(),
    extractTransaction: vi.fn(() => ({ toHex: () => "mock-tx-hex" })),
    toHex: vi.fn(() => "mock-psbt-hex"),
    __CACHE: {
      __TX: mockTx,
    },
  };

  return {
    initEccLib: vi.fn(() => true),
    networks: {
      bitcoin: {
        messagePrefix: "\x18Bitcoin Signed Message:\n",
        bech32: "bc",
        bip32: { public: 0x0488b21e, private: 0x0488ade4 },
        pubKeyHash: 0x00,
        scriptHash: 0x05,
        wif: 0x80,
      },
      testnet: {
        messagePrefix: "\x18Bitcoin Signed Message:\n",
        bech32: "tb",
        bip32: { public: 0x043587cf, private: 0x04358394 },
        pubKeyHash: 0x6f,
        scriptHash: 0xc4,
        wif: 0xef,
      },
    },
    Psbt: vi.fn(() => mockPsbtInstance),
    script: {
      compile: vi.fn(() => Buffer.from("mock-script")),
    },
  };
});

// Mock utils/ecc to prevent initialization issues
vi.mock("../utils/ecc", () => ({
  bitcoin: {
    initEccLib: vi.fn(() => true),
    networks: {
      bitcoin: {},
      testnet: {},
    },
    Psbt: vi.fn(),
  },
  ecc: mockEcc,
}));

// Mock axios
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
    })),
  },
}));

// Mock @dfinity/agent
vi.mock("@dfinity/agent", () => ({
  Actor: {
    createActor: vi.fn(() => ({
      invoke: vi.fn(),
    })),
  },
  HttpAgent: {
    createSync: vi.fn(() => ({})),
  },
}));
