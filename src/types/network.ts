export const Network = {
  Mainnet: "mainnet",
  Testnet: "testnet",
} as const;

export type Network = (typeof Network)[keyof typeof Network];
