import { type Network } from "./network";
import { IDL } from "@dfinity/candid";

export type Config = {
  network: Network;
  xverseApiKey: string;
  exchangeIdlFactory: IDL.InterfaceFactory;
  exchangeId: string;
  exchangeCanisterId: string;
};
