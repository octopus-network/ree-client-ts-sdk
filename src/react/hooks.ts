import { useState, useEffect, useCallback } from "react";
import { useRee } from "./ReeProvider";
import type { Utxo } from "../types/utxo";
import type { RuneInfo } from "../types/rune";
import type { Pool, PoolInfo } from "../types/pool";

interface UseBalanceOptions {
  /** Auto-refresh interval in milliseconds (0 to disable) */
  refreshInterval?: number;
  /** Enable automatic refresh when wallet changes */
  autoRefresh?: boolean;
}

/**
 * Hook to get and manage Bitcoin balance
 * @returns Object with balance, loading state, error, and refresh function
 */
export function useBtcBalance(options: UseBalanceOptions = {}) {
  const { refreshInterval = 0, autoRefresh = true } = options;
  const { client, paymentAddress } = useRee();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!paymentAddress) {
      setBalance(null);
      setError("Payment address not set");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const btcBalance = await client.getBtcBalance(paymentAddress);
      setBalance(btcBalance);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch BTC balance"
      );
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [client, paymentAddress]);

  // Auto-fetch when payment address changes
  useEffect(() => {
    if (autoRefresh) {
      fetchBalance();
    }
  }, [paymentAddress, fetchBalance, autoRefresh]);

  // Polling interval
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchBalance, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, paymentAddress, fetchBalance]);

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance,
  };
}

/**
 * Hook to get and manage Rune balance for a specific rune
 * @param runeId - The rune ID to get balance for
 * @returns Object with balance, loading state, error, and refresh function
 */
export function useRuneBalance(
  runeId: string | undefined,
  options: UseBalanceOptions = {}
) {
  const { refreshInterval = 0, autoRefresh = true } = options;
  const { client, address } = useRee();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      setError("Address not set");
      return;
    }

    if (!runeId) {
      setBalance(null);
      setError("Rune ID is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const runeBalance = await client.getRuneBalance(address, runeId);
      setBalance(runeBalance ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch rune balance"
      );
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [client, address, runeId]);

  // Auto-fetch when address or runeId changes
  useEffect(() => {
    if (autoRefresh && runeId) {
      fetchBalance();
    }
  }, [address, runeId, fetchBalance, autoRefresh]);

  // Polling interval
  useEffect(() => {
    if (refreshInterval > 0 && runeId) {
      const interval = setInterval(fetchBalance, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, address, runeId, fetchBalance]);

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance,
  };
}

/**
 * Hook to get and manage Bitcoin UTXOs
 * @returns Object with UTXOs, loading state, error, and refresh function
 */
export function useBtcUtxos(options: UseBalanceOptions = {}) {
  const { refreshInterval = 0, autoRefresh = true } = options;
  const { client, paymentAddress } = useRee();
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUtxos = useCallback(async () => {
    if (!paymentAddress) {
      setUtxos([]);
      setError("Payment address not set");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const btcUtxos = await client.getBtcUtxos(paymentAddress);
      setUtxos(btcUtxos);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch BTC UTXOs"
      );
      setUtxos([]);
    } finally {
      setLoading(false);
    }
  }, [client, paymentAddress]);

  // Auto-fetch when payment address changes
  useEffect(() => {
    if (autoRefresh && paymentAddress) {
      fetchUtxos();
    }
  }, [paymentAddress, fetchUtxos, autoRefresh]);

  // Polling interval
  useEffect(() => {
    if (refreshInterval > 0 && paymentAddress) {
      const interval = setInterval(fetchUtxos, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, paymentAddress, fetchUtxos]);

  return {
    utxos,
    loading,
    error,
    refetch: fetchUtxos,
  };
}

/**
 * Hook to get and manage Rune UTXOs for a specific rune
 * @param runeId - The rune ID to get UTXOs for
 * @returns Object with UTXOs, loading state, error, and refresh function
 */
export function useRuneUtxos(runeId: string, options: UseBalanceOptions = {}) {
  const { refreshInterval = 0, autoRefresh = true } = options;
  const { client, address } = useRee();
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUtxos = useCallback(async () => {
    if (!address) {
      setUtxos([]);
      setError("Address not set");
      return;
    }

    if (!runeId) {
      setUtxos([]);
      setError("Rune ID is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const runeUtxos = await client.getRuneUtxos(address, runeId);
      setUtxos(runeUtxos);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch rune UTXOs"
      );
      setUtxos([]);
    } finally {
      setLoading(false);
    }
  }, [client, address, runeId]);

  // Auto-fetch when address or runeId changes
  useEffect(() => {
    if (autoRefresh && address && runeId) {
      fetchUtxos();
    }
  }, [address, runeId, fetchUtxos, autoRefresh]);

  // Polling interval
  useEffect(() => {
    if (refreshInterval > 0 && address && runeId) {
      const interval = setInterval(fetchUtxos, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, address, runeId, fetchUtxos]);

  return {
    utxos,
    loading,
    error,
    refetch: fetchUtxos,
  };
}

/**
 * Hook to search for runes by keyword
 * @param keyword - Search term (rune ID or partial name)
 * @returns Object with runes, loading state, error, and search function
 */
export function useSearchRunes() {
  const { client } = useRee();

  const searchRunes = useCallback(
    async (searchKeyword?: string) => {
      const searchTerm = searchKeyword;
      if (!searchTerm) {
        throw new Error("Search keyword is required");
      }

      const results = await client.searchRunes(searchTerm);
      return results;
    },
    [client]
  );

  return searchRunes;
}

/**
 * Hook to get rune information by ID
 * @param runeId - The rune ID to get info for
 * @returns Object with rune info, loading state, error, and refetch function
 */
export function useRuneInfo(runeId?: string) {
  const { client } = useRee();
  const [runeInfo, setRuneInfo] = useState<RuneInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRuneInfo = useCallback(async () => {
    if (!runeId) {
      setRuneInfo(null);
      setError("Rune ID is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const info = await client.getRuneInfo(runeId);
      setRuneInfo(info || null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch rune info"
      );
      setRuneInfo(null);
    } finally {
      setLoading(false);
    }
  }, [client, runeId]);

  return {
    runeInfo,
    loading,
    error,
    refetch: fetchRuneInfo,
  };
}

/**
 * Hook to get list of all pools
 * @returns Object with pools, loading state, error, and refetch function
 */
export function usePoolList() {
  const { client } = useRee();
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPools = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const poolList = await client.getPoolList();
      setPools(poolList);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch pool list"
      );
      setPools([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  return {
    pools,
    loading,
    error,
    refetch: fetchPools,
  };
}

/**
 * Hook to get pool information by address
 * @param poolAddress - The pool address to get info for
 * @returns Object with pool info, loading state, error, and refetch function
 */
export function usePoolInfo(poolAddress?: string) {
  const { client } = useRee();
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPoolInfo = useCallback(async () => {
    if (!poolAddress) {
      setPoolInfo(null);
      setError("Pool address is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const info = await client.getPoolInfo(poolAddress);
      setPoolInfo(info);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch pool info"
      );
      setPoolInfo(null);
    } finally {
      setLoading(false);
    }
  }, [client, poolAddress]);

  useEffect(() => {
    fetchPoolInfo();
  }, [poolAddress]);

  return {
    poolInfo,
    loading,
    error,
    refetch: fetchPoolInfo,
  };
}
