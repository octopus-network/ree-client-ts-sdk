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

interface ReeContextValue {
  client: ReeClient | null;
  address: string;
  paymentAddress: string;
  updateWallet: (wallet: { address?: string; paymentAddress?: string }) => void;
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

  const contextValue = useMemo(
    () => ({
      client,
      ...wallet,
      updateWallet,
    }),
    [client, wallet, updateWallet]
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
