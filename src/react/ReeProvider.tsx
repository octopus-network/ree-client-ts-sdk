import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";

import { ReeClient } from "../client";

import type { Config } from "../types/config";

import { Transaction } from "../lib/transaction";
import type { ActorSubclass } from "@dfinity/agent";

interface ReeContextValue {
  client: ReeClient;
  exchange: ActorSubclass;
  address: string;
  paymentAddress: string;
  updateWallet: (wallet: { address?: string; paymentAddress?: string }) => void;

  createTransaction: (params?: {
    feeRate?: number;
    mergeSelfRuneBtcOutputs?: boolean;
  }) => Promise<Transaction>;
}

const ReeContext = createContext<ReeContextValue | null>(null);

interface ReeProviderProps {
  children: ReactNode;
  config: Config;
}

export function ReeProvider({ children, config }: ReeProviderProps) {
  if (!config) {
    throw new Error("ReeProvider: config is required");
  }

  if (!config.network) {
    throw new Error("ReeProvider: config.network is required");
  }

  if (!config.maestroApiKey) {
    throw new Error("ReeProvider: config.maestroApiKey is required");
  }

  if (!config.exchangeIdlFactory) {
    throw new Error("ReeProvider: config.exchangeIdlFactory is required");
  }

  if (!config.exchangeCanisterId) {
    throw new Error("ReeProvider: config.exchangeCanisterId is required");
  }

  const [wallet, setWallet] = useState({
    address: "",
    paymentAddress: "",
    publicKey: "",
    paymentPublicKey: "",
  });

  const updateWallet = useCallback((updates: Partial<typeof wallet>) => {
    setWallet((prev) => ({ ...prev, ...updates }));
  }, []);

  const client = useMemo(() => {
    return new ReeClient(config);
  }, [config]);

  const createTransaction = useCallback(
    async (params?: {
      feeRate?: number;
      mergeSelfRuneBtcOutputs?: boolean;
    }) => {
      if (!client) throw new Error("Client not available");
      if (!wallet.address || !wallet.paymentAddress) {
        throw new Error("Wallet not connected");
      }
      return client.createTransaction({
        address: wallet.address,
        paymentAddress: wallet.paymentAddress,
        feeRate: params?.feeRate,
        mergeSelfRuneBtcOutputs: params?.mergeSelfRuneBtcOutputs,
      });
    },
    [client, wallet]
  );

  const contextValue = useMemo(
    () => ({
      client,
      ...wallet,
      exchange: client.exchange,
      updateWallet,
      createTransaction,
    }),
    [client, wallet, updateWallet, createTransaction]
  );

  return (
    <ReeContext.Provider value={contextValue}>{children}</ReeContext.Provider>
  );
}

export function useRee() {
  const context = useContext(ReeContext);
  if (!context) {
    throw new Error("useRee must be used within ReeProvider");
  }
  return context;
}
