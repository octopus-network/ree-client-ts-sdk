# Ree Client TypesSript SDK

A TypeScript SDK for interacting with the Ree protocol on Bitcoin, providing seamless integration with Bitcoin wallets and Rune tokens.

## Features

- 🔗 **Bitcoin Integration**: Connect with Bitcoin wallets and manage UTXOs
- 🪙 **Rune Support**: Full support for Bitcoin Runes protocol
- ⚛️ **React Integration**: Built-in React hooks and providers
- 🔧 **TypeScript**: Full type safety and IntelliSense support
- 🧪 **Well Tested**: Comprehensive test coverage
- 📦 **Lightweight**: Minimal dependencies and optimized bundle size

## Installation

```bash
npm install @omnity/ree-client-ts-sdk
```

## Quick Start

### Initializing the Client

```typescript
import { ReeClient, Network, type Config } from "@omnity/ree-client-ts-sdk";

const config: Config = {
  network: Network.Testnet,
  maestroApiKey: "your-maestro-api-key",
  exchangeIdlFactory: yourExchangeIdlFactory,
  exchangeCanisterId: "your-canister-id",
};

const client = new ReeClient(config);
```

### Basic Usage

```typescript
// Get Bitcoin UTXOs
const utxos = await client.getBtcUtxos("bc1q..."); // payment address

// Get Rune UTXOs
const runeUtxos = await client.getRuneUtxos("bc1q...", "RUNE_ID"); // address, runeId

// Get Rune Info
const runeInfo = await client.getRuneInfo("RUNE_ID");

// Get Bitcoin Balance
const btcBalance = await client.getBtcBalance("bc1q..."); // payment address

const runeBalance = await client.getRuneBalance("bc1q...", "RUNE_ID"); // address, runeId

// Search for runes
const runes = await client.searchRunes("DOG");

// Get pool information
const pools = await client.getPoolList();
const poolInfo = await client.getPoolInfo("pool-address");
```

### Creating and Executing Transactions

```typescript
// Create a swap transaction
const transaction = await client.createTransaction({
  address: "bc1q...", // Bitcoin address
  paymentAddress: "bc1q...", // Payment address
  poolAddress: "bc1q...",
  sendBtcAmount: BigInt(100000), // 0.001 BTC in satoshis
  sendRuneAmount: BigInt(0),
  receiveBtcAmount: BigInt(0),
  receiveRuneAmount: BigInt(1000),
});

// Build the transaction
const psbt = await transaction.build("swap", BigInt(Date.now()));

// Sign with your wallet (implementation depends on wallet)
const signedPsbt = await wallet.signPsbt(psbt);

// Submit the transaction
const result = await transaction.send(signedPsbt.toHex());
```

### React Integration

```tsx
import { ReeProvider, useRee, useBtcBalance } from "@ree-network/ts-sdk";

function App() {
  return (
    <ReeProvider config={config}>
      <WalletComponent />
    </ReeProvider>
  );
}

function WalletComponent() {
  const { client, address, updateWallet } = useRee();

  const { balance: btcBalance } = useBtcBalance();

  const connectWallet = () => {
    updateWallet({
      address: "bc1q...",
      paymentAddress: "bc1q...",
    });
  };

  return (
    <div>
      <div>Connected: {address}</div>
      <div>Balance: {btcBalance} BTC</div>
      <button onClick={connectWallet}>Connect wallet</button>
    </div>
  );
}
```

### Integration with LaserEyes

```tsx
import { LaserEyesProvider, useLaserEyes } from "@omnisat/lasereyes-core";
import { ReeProvider, useRee } from "@ree-network/ts-sdk";

function App() {
  return (
    <LaserEyesProvider config={laserEyesConfig}>
      <ReeProvider config={reeConfig}>
        <ConnectWalletModal />
        <MyComponent />
      </ReeProvider>
    </LaserEyesProvider>
  );
}

function MyComponent({ children }) {
  const { signPsbt } = useLaserEyes();
  const { updateWallet, createTransaction, exchange } = useRee();

  const sendTransaction = async () => {
    const depositBtcAmount = BigInt(100000);
    const depositOffer = await exchange.pre_deposit("bc1q...", {
      id: "0:0",
      value: depositBtcAmount,
    });

    const tx = await createTransaction({
      poolAddress: "bc1q...",
      sendBtcAmount: depositBtcAmount,
      sendRuneAmount: BigInt(0),
      receiveBtcAmount: BigInt(0),
      receiveRuneAmount: BigInt(0),
    });

    const psbt = await tx.build("deposit", depositOffer.nonce);

    const signedPsbt = await signPsbt(psbt);
    const txid = await tx.send(signedPsbt.toHex());

    console.log("Transaction sent:", txid);
  };

  return (
    <div>
      <button onClick={sendTransaction}>Send Transaction</button>
    </div>
  );
}

function ConnectWalletModal() {
  const { address, paymentAddress, connect } = useLaserEyes();
  const { updateWallet } = useRee();

  useEffect(() => {
    updateWallet({
      address,
      paymentAddress,
    });
  }, [address, paymentAddress, updateWallet]);

  return (
    <div>
      <button onClick={connect}>Connect Wallet</button>
    </div>
  );
}
```

## API Reference

### ReeClient

The main client class for interacting with the Ree protocol.

#### Constructor

```typescript
new ReeClient(config: Config)
```

#### Methods

##### Balance & UTXO Methods

- `getBtcBalance(paymentAddress: string): Promise<number>` - Get Bitcoin balance in BTC
- `getBtcUtxos(paymentAddress: string): Promise<Utxo[]>` - Get Bitcoin UTXOs for the payment address
- `getRuneBalance(address: string, runeId: string): Promise<number | undefined>` - Get balance for a specific rune
- `getRuneUtxos(address: string, runeId: string): Promise<Utxo[]>` - Get UTXOs containing a specific rune

##### Rune Information Methods

- `searchRunes(keyword: string): Promise<RuneInfo[]>` - Search for runes by keyword or rune ID
- `getRuneInfo(runeId: string): Promise<RuneInfo | undefined>` - Get detailed information for a specific rune

##### Pool Methods

- `getPoolList(): Promise<Pool[]>` - Get list of all available liquidity pools
- `getPoolInfo(poolAddress: string): Promise<PoolInfo>` - Get information about a specific liquidity pool

##### Transaction Methods

- `createTransaction(params): Promise<Transaction>` - Create a transaction for trading with a liquidity pool

### Transaction

Transaction builder for Bitcoin and Rune transactions.

#### Methods

- `build(action: string, nonce: bigint, actionParams?: string): Promise<bitcoin.Psbt>` - Build the PSBT
- `send(signedPsbtHex: string): Promise<any>` - Submit the signed transaction to orchestrator

### React Hooks

The SDK provides specialized hooks for all operations:

```tsx
import {
  useBtcBalance,
  useRuneBalance,
  useBtcUtxos,
  useRuneUtxos,
  useSearchRunes,
  useRuneInfo,
  usePoolList,
  usePoolInfo,
} from "@ree-network/ts-sdk";

function TradingDashboard() {
  // Balance & UTXO hooks
  const { balance: btcBalance, loading: btcLoading } = useBtcBalance();
  const { balance: runeBalance } = useRuneBalance("840000:3");
  const { utxos: btcUtxos } = useBtcUtxos();
  const { utxos: runeUtxos } = useRuneUtxos("840000:3");

  const [runes, setRunes] = useState([]);

  // Rune search hooks
  const searchRunes = useSearchRunes();
  const { runeInfo } = useRuneInfo("840000:3");

  // Pool hooks
  const { pools } = usePoolList();
  const { poolInfo } = usePoolInfo("bc1q...");

  const handleSearch = () => {
    searchRunes("IRCH").then(setRunes); // Search for runes containing "RICH"
  };

  return (
    <div>
      <h2>Balances</h2>
      <div>BTC: {btcBalance} BTC</div>
      <div>Rune: {runeBalance}</div>

      <h2>Search Runes</h2>
      <button onClick={handleSearch}>Search DOG</button>
      <div>{runes.length} runes found</div>

      <h2>Pools</h2>
      <div>{pools.length} pools available</div>
    </div>
  );
}
```

#### Available Hooks

**Balance & UTXO Hooks:**

- `useBtcBalance(options?)` - Bitcoin balance management
- `useRuneBalance(runeId, options?)` - Rune balance for specific rune
- `useBtcUtxos(options?)` - Bitcoin UTXOs management
- `useRuneUtxos(runeId, options?)` - Rune UTXOs for specific rune

**Rune Information Hooks:**

- `useSearchRunes(keyword?, options?)` - Search runes by keyword
- `useRuneInfo(runeId?, options?)` - Get rune information by ID

**Pool Hooks:**

- `usePoolList(options?)` - Get all available pools
- `usePoolInfo(poolAddress?, options?)` - Get specific pool information

#### Hook Usage Examples

```tsx

// Get rune info with polling
const { runeInfo } = useRuneInfo("840000:3", { refreshInterval: 30000 });

// Get pools with manual refresh only
const { pools, refetch } = usePoolList({ autoRefresh: false });

// Search runes
const searchRuens = useSearchRunes();
await searchRunes("RICH");
```

### Core useRee Hook

The `useRee()` hook now focuses on core functionality:

```tsx
const {
  client, // Direct access to ReeClient
  address, // Current Bitcoin address
  paymentAddress, // Current payment address
  updateWallet, // Update wallet addresses
  exchange, // Exchange canister actor
  createTransaction, // Create transactions
} = useRee();
```

### Types

The SDK exports all necessary TypeScript types:

```typescript
import type {
  Config,
  Utxo,
  RuneInfo,
  Pool,
  PoolInfo,
  IntentionSet,
  Intention,
  TransactionConfig,
  AddressType,
} from "@ree-network/ts-sdk";
```

### Configuration

```typescript
interface Config {
  network: Network; // Network.Mainnet or Network.Testnet
  maestroApiKey: string; // Your Maestro API key
  exchangeIdlFactory: IDL.InterfaceFactory; // Exchange canister IDL
  exchangeCanisterId: string; // Exchange canister ID
  exchangeId: string; // Exchange ID for transactions
}
```

### Networks

```typescript
enum Network {
  Mainnet = "mainnet",
  Testnet = "testnet",
}
```

## Error Handling

```typescript
try {
  const utxos = await client.getBtcUtxos("bc1q...");
} catch (error) {
  console.error("Failed to fetch UTXOs:", error);
}

// React hook error handling
const { client } = useRee();

const loadBalance = async () => {
  try {
    const balance = await client.getBtcBalance("bc1q...");
    setBalance(balance);
  } catch (error) {
    console.error("Failed to load balance:", error);
    setError(error.message);
  }
};
```
