# Ree Client TypeScript SDK

A TypeScript SDK for interacting with the Ree protocol on Bitcoin, providing seamless integration with Bitcoin wallets and Rune tokens.

## Features

- 🔗 **Bitcoin Integration**: Connect with Bitcoin wallets and manage UTXOs
- 🪙 **Rune Support**: Full support for Bitcoin Runes protocol
- ⚛️ **React Integration**: Built-in React hooks and providers
- 🔧 **TypeScript**: Full type safety and IntelliSense support
- 🧪 **Well Tested**: Comprehensive test coverage
- 📦 **Lightweight**: Minimal dependencies and optimized bundle size
- 🔄 **Multi-Intention Transactions**: Support for complex transactions with multiple operations

## Installation

```bash
npm install @omnity/ree-client-ts-sdk
```

## Quick Start

### Initializing the Client

```typescript
import { ReeClient, Network, type Config } from "@omnity/ree-client-ts-sdk";

const config: Config = {
  network: Network.Testnet, // or Network.Mainnet
  maestroApiKey: "your-maestro-api-key",
  exchangeIdlFactory: yourExchangeIdlFactory,
  exchangeCanisterId: "your-exchange-canister-id",
  exchangeId: "your-exchange-id",
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

#### Simple Single-Pool Transaction

```typescript
// Create a transaction for a single pool operation
const transaction = await client.createTransaction({
  address: "bc1p...", // Bitcoin address for runes
  paymentAddress: "bc1q...", // Payment address for BTC
});

// Add a single intention (e.g., swap BTC for runes)
transaction.addIntention({
  poolAddress: "bc1p...",
  inputCoins: [
    {
      coin: { 
        id: "0:0", 
        value: BigInt(100000) 
      }, // Send 0.001 BTC,
      from: paymentAddress,
    },
  ],
  outputCoins: [
    {
      coin: { 
        id: "840000:3", 
        value: BigInt(1000) 
      }, // Receive 1000 runes,
      to: address,
    },
  ],
  action: "swap",
  nonce: BigInt(1234),
});

// Build and execute
const psbt = await transaction.build();
const signedPsbt = await wallet.signPsbt(psbt);
const result = await transaction.send(signedPsbt.toHex());
```

#### Advanced Multi-Intention Transaction

```typescript
// Create a complex transaction with multiple operations
const transaction = await client.createTransaction({
  address: "bc1p...",
  paymentAddress: "bc1q...",
});

// Add multiple intentions in a single transaction
// Intention 1: Deposit BTC to Pool 1
transaction.addIntention({
  poolAddress: "bc1p...pool1",
  inputCoins: [
    {
      // Deposit 0.0005 BTC
      coin: { 
        id: "0:0", 
        value: BigInt(50000) 
      },
      from: paymentAddress,
    },
  ],
  outputCoins: [],
  action: "deposit",
  nonce: BigInt(Date.now()),
});

// Intention 2: Swap runes between pools
transaction.addIntention({
  poolAddress: "bc1q...pool2",
  inputCoins: [
    {
      // Send 500 of rune A,
      coin: { 
        id: "840000:3", 
        value: BigInt(500) 
      },
      from: address,
    },
  ],
  outputCoins: [
    {
      // Receive 250 of rune B,
      coin: { 
        id: "840000:5", 
        value: BigInt(250) 
      },
      to: address,
    },
  ],
  action: "swap",
  nonce: BigInt(Date.now() + 1),
});

// Build and execute the multi-intention transaction
const psbt = await transaction.build();
const signedPsbt = await wallet.signPsbt(psbt);
const result = await transaction.send(signedPsbt.toHex());
```

### React Integration

```tsx
import { ReeProvider, useRee, useBtcBalance } from "@omnity/ree-client-ts-sdk";

function App() {
  return (
    <ReeProvider config={config}>
      <WalletComponent />
    </ReeProvider>
  );
}

function WalletComponent() {
  const { client, address, paymentAddress, updateWallet, createTransaction } = useRee();
  const { balance: btcBalance } = useBtcBalance();

  const connectWallet = () => {
    updateWallet({
      address: "bc1q...",
      paymentAddress: "bc1q...",
    });
  };

  const executeComplexTransaction = async () => {
    // Create transaction with multiple pools
    const tx = await createTransaction();

    // Add multiple intentions
    tx.addIntention({
      poolAddress: "pool1",
      inputCoins: [{
        coin: { 
          id: "0:0", 
          value: BigInt(100000) 
        },
        from: paymentAddress
      }],
      outputCoins: [
        coint: { 
          id: "840000:3", 
          value: BigInt(1000)
        },
        to: address
      ],
      action: "swap",
      nonce: BigInt(Date.now()),
    });

    tx.addIntention({
      poolAddress: "pool2",
      inputCoins: [{
        coin: { 
          id: "840000:3", 
          value: BigInt(500) 
        },
        from: address
      }],
      outputCoins: [{
        coin: { 
          id: "0:0", 
          value: BigInt(50000) 
        },
        to: paymentAddress
      }],
      action: "swap",
      nonce: BigInt(Date.now() + 1),
    });

    const psbt = await tx.build();
    // Sign and send...
  };

  return (
    <div>
      <div>Connected: {address}</div>
      <div>Balance: {btcBalance} BTC</div>
      <button onClick={connectWallet}>Connect wallet</button>
      <button onClick={executeComplexTransaction}>
        Execute Complex Transaction
      </button>
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

    const tx = await createTransaction();

    tx.addIntention({
      poolAddress: "bc1q...",
      inputCoins: [{
        coin: { 
          id: "0:0", 
          value: depositBtcAmount 
        },
        from: paymentAddress
      }],
      outputCoins: [],
      action: "deposit",
      nonce: depositOffer.nonce,
    });

    const psbt = await tx.build();

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

- `createTransaction(): Promise<Transaction>` - Create a transaction

### Transaction

Transaction builder for Bitcoin and Rune transactions with multi-intention support.

#### Methods

- `addIntention(intention: Intention): void` - Add an intention to the transaction
- `build(): Promise<bitcoin.Psbt>` - Build the PSBT with all intentions
- `send(signedPsbtHex: string): Promise<any>` - Submit the signed transaction

#### Intention Structure

```typescript
interface Intention {
  poolAddress: string; // Target pool address
  inputCoins: InputCoin[]; // Coins being sent to the pool
  outputCoins: InputCoin[]; // Coins expected from the pool
  action: string; // Action type (swap, deposit, withdraw, etc.)
  actionParams?: string; // Optional action parameters
  nonce: bigint; // Unique nonce for the intention
}

type CoinBalance = {
  id: string; // Coin ID ("0:0" for BTC, "840000:3" for runes)
  value: bigint; // Amount in smallest unit
}

 type InputCoin = {
  coin: CoinBalance;
  from: string;
};

type OutputCoin = {
  coin: CoinBalance;
  to: string;
};

```

### Multi-Intention Transaction Benefits

1. **Atomic Operations**: All intentions succeed or fail together
2. **Gas Efficiency**: Single transaction fee for multiple operations
3. **Complex Strategies**: Enable sophisticated trading strategies
4. **Cross-Pool Operations**: Interact with multiple pools in one transaction

### Transaction Flow

1. **Create Transaction**: Specify involved pools and runes
2. **Add Intentions**: Define each operation you want to perform
3. **Build PSBT**: SDK calculates all inputs/outputs and fees
4. **Sign**: Use your wallet to sign the transaction
5. **Submit**: Send to the network for execution

All intentions in a transaction are processed atomically - if any intention fails, the entire transaction is reverted.

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

