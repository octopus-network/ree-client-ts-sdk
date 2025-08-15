import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";

import { ReeClient } from "../client";
import type { IntentionSet } from "../types/orchestrator";
import type { Config } from "../types/config";
import type { Pool, PoolInfo } from "../types/pool";
import type { RuneInfo } from "../types/rune";
import type { Utxo } from "../types/utxo";
import { Transaction } from "../lib/transaction";

interface ReeContextValue {
  client: ReeClient | null;
  address: string;
  paymentAddress: string;
  updateWallet: (wallet: { address?: string; paymentAddress?: string }) => void;

  getBtcBalance: () => Promise<number>;
  getBtcUtxos: () => Promise<Utxo[]>;
  getRuneBalance: (runeId: string) => Promise<number | undefined>;
  getRuneUtxos: (runeId: string) => Promise<Utxo[]>;
  searchRunes: (keyword: string) => Promise<RuneInfo[]>;
  getRuneInfo: (runeId: string) => Promise<RuneInfo | undefined>;
  getPoolList: () => Promise<Pool[]>;
  getPoolInfo: (poolAddress: string) => Promise<PoolInfo>;

  createTransaction: (params: {
    runeId?: string;
    poolAddress: string;
    sendBtcAmount: bigint;
    sendRuneAmount: bigint;
    receiveBtcAmount: bigint;
    receiveRuneAmount: bigint;
  }) => Promise<Transaction>;
  invoke: (intentionSet: IntentionSet, signedPsbtHex: string) => Promise<any>;
}

const ReeContext = createContext<ReeContextValue | null>(null);

interface ReeProviderProps {
  children: ReactNode;
  config: Config;
}

export function ReeProvider({ children, config }: ReeProviderProps) {
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
    if (!wallet.address || !wallet.paymentAddress) {
      return null;
    }
    return new ReeClient(wallet.address, wallet.paymentAddress, config);
  }, [wallet.address, wallet.paymentAddress, config]);

  const getBtcBalance = useCallback(async () => {
    if (!client) throw new Error("Client not available");
    return client.getBtcBalance();
  }, [client]);

  const getBtcUtxos = useCallback(async () => {
    if (!client) throw new Error("Client not available");
    return client.getBtcUtxos();
  }, [client]);

  const getRuneBalance = useCallback(
    async (runeId: string) => {
      if (!client) throw new Error("Client not available");
      return client.getRuneBalance(runeId);
    },
    [client]
  );

  const getRuneUtxos = useCallback(
    async (runeId: string) => {
      if (!client) throw new Error("Client not available");
      return client.getRuneUtxos(runeId);
    },
    [client]
  );

  const searchRunes = useCallback(
    async (keyword: string) => {
      if (!client) throw new Error("Client not available");
      return client.searchRunes(keyword);
    },
    [client]
  );

  const getRuneInfo = useCallback(
    async (runeId: string) => {
      if (!client) throw new Error("Client not available");
      return client.getRuneInfo(runeId);
    },
    [client]
  );

  const getPoolList = useCallback(async () => {
    if (!client) throw new Error("Client not available");
    return client.getPoolList();
  }, [client]);

  const getPoolInfo = useCallback(
    async (poolAddress: string) => {
      if (!client) throw new Error("Client not available");
      return client.getPoolInfo(poolAddress);
    },
    [client]
  );

  const createTransaction = useCallback(
    async (params: {
      runeId?: string;
      poolAddress: string;
      sendBtcAmount: bigint;
      sendRuneAmount: bigint;
      receiveBtcAmount: bigint;
      receiveRuneAmount: bigint;
    }) => {
      if (!client) throw new Error("Client not available");
      return client.createTransaction(params);
    },
    [client]
  );

  const invoke = useCallback(
    async (intentionSet: IntentionSet, signedPsbtHex: string) => {
      if (!client) throw new Error("Client not available");
      return client.invoke(intentionSet, signedPsbtHex);
    },
    [client]
  );

  const contextValue = useMemo(
    () => ({
      client,
      ...wallet,
      updateWallet,
      getBtcBalance,
      getBtcUtxos,
      getRuneBalance,
      getRuneUtxos,
      searchRunes,
      getRuneInfo,
      getPoolList,
      getPoolInfo,
      createTransaction,
      invoke,
    }),
    [
      client,
      wallet,
      updateWallet,
      getBtcBalance,
      getBtcUtxos,
      getRuneBalance,
      getRuneUtxos,
      searchRunes,
      getRuneInfo,
      getPoolList,
      getPoolInfo,
      createTransaction,
      invoke,
    ]
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
