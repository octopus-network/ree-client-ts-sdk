import { type Network } from "./network";
import { IDL } from "@dfinity/candid";

export type Config = {
  network: Network;
  maestroApiKey: string;
  exchangeIdlFactory: IDL.InterfaceFactory;
  exchangeCanisterId: string;
};
