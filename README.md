# Ree Typescript SDK

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
npm install @ree-network/ts-sdk
```

## Quick Start

### Initializing the Client

```typescript
import { ReeClient, Network, type Config } from "@ree-network/ts-sdk";

const config: Config = {
  network: Network.Testnet,
  maestroApiKey: "your-maestro-api-key",
  exchangeIdlFactory: yourExchangeIdlFactory,
  exchangeCanisterId: "your-canister-id",
};

const client = new ReeClient(
  "bc1q...", // Bitcoin address
  "bc1q...", // Payment address
  config
);
```

### Basic Usage

```typescript
// Get Bitcoin UTXOs
const utxos = await client.getBtcUtxos();

// Get Rune UTXOs
const runeUtxos = await client.getRuneUtxos("RUNE_ID");

// Get Rune Info
const runeInfo = await client.getRuneInfo("RUNE_ID");

// Get Bitcoin Balance
const btcBalance = await client.getBtcBalance();

const runeBalance = await client.getRuneBalance("RUNE_ID");

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
  poolAddress: "bc1q...",
  sendBtcAmount: BigInt(100000), // 0.001 BTC in satoshis
  sendRuneAmount: BigInt(0),
  receiveBtcAmount: BigInt(0),
  receiveRuneAmount: BigInt(1000),
});

// Build the transaction
const { psbt, fee } = await transaction.build();

// Sign with your wallet (implementation depends on wallet)
const signedPsbt = await wallet.signPsbt(psbt);

// Submit the transaction
const result = await client.invoke(
  transaction.getIntentionSet(),
  signedPsbt.toHex()
);
```

### React Integration

```tsx
import { ReeProvider, useRee } from "@ree-network/ts-sdk";

function App() {
  return (
    <ReeProvider config={config}>
      <WalletComponent />
    </ReeProvider>
  );
}

function WalletComponent() {
  const {
    client,
    address,
    updateWallet,
    getBtcBalance,
    getRuneBalance,
    createTransaction,
  } = useRee();

  const [btcBalance, setBtcBalance] = useState<number | null>(null);

  const connectWallet = () => {
    updateWallet({
      address: "bc1q...",
      paymentAddress: "bc1q...",
    });
  };

  const loadBalance = async () => {
    if (client) {
      const balance = await getBtcBalance();
      setBtcBalance(balance);
    }
  };

  if (!client) {
    return <button onClick={connectWallet}>Connect Wallet</button>;
  }

  return (
    <div>
      <div>Connected: {address}</div>
      <div>Balance: {btcBalance} BTC</div>
      <button onClick={loadBalance}>Load Balance</button>
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
        <ReeWrapper>
          <MyComponent />
        </ReeWrapper>
      </ReeProvider>
    </LaserEyesProvider>
  );
}

function ReeWrapper({ children }) {
  const { address, paymentAddress, connected } = useLaserEyes();
  const { updateWallet } = useRee();

  useEffect(() => {
    if (connected) {
      updateWallet({
        address,
        paymentAddress,
      });
    }
  }, [address, paymentAddress, connected, updateWallet]);

  return <>{children}</>;
}
```

## API Reference

### ReeClient

The main client class for interacting with the Ree protocol.

#### Constructor

```typescript
new ReeClient(address: string, paymentAddress: string, config: Config)
```

#### Methods

##### Balance & UTXO Methods

- `getBtcBalance(): Promise<number>` - Get Bitcoin balance in BTC
- `getBtcUtxos(): Promise<Utxo[]>` - Get Bitcoin UTXOs for the payment address
- `getRuneBalance(runeId: string): Promise<number | undefined>` - Get balance for a specific rune
- `getRuneUtxos(runeId: string): Promise<Utxo[]>` - Get UTXOs containing a specific rune

##### Rune Information Methods

- `searchRunes(keyword: string): Promise<RuneInfo[]>` - Search for runes by keyword or rune ID
- `getRuneInfo(runeId: string): Promise<RuneInfo | undefined>` - Get detailed information for a specific rune

##### Pool Methods

- `getPoolList(): Promise<Pool[]>` - Get list of all available liquidity pools
- `getPoolInfo(poolAddress: string): Promise<PoolInfo>` - Get information about a specific liquidity pool

##### Transaction Methods

- `createTransaction(params): Promise<Transaction>` - Create a transaction for trading with a liquidity pool
- `invoke(intentionSet: IntentionSet, signedPsbtHex: string): Promise<any>` - Submit a signed transaction

### Transaction

Transaction builder for Bitcoin and Rune transactions.

#### Methods

- `build(): Promise<{ psbt: bitcoin.Psbt, fee: bigint }>` - Build the PSBT and calculate fees
- `getIntentionSet(): IntentionSet` - Get the intention set for the transaction

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

  // Rune search hooks
  const { runes, search } = useSearchRunes();
  const { runeInfo } = useRuneInfo("840000:3");

  // Pool hooks
  const { pools } = usePoolList();
  const { poolInfo } = usePoolInfo("bc1q...");

  const handleSearch = () => {
    search("DOG"); // Search for runes containing "DOG"
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
// Search runes with auto-search
const { runes, loading, search } = useSearchRunes("DOG", { autoRefresh: true });

// Get rune info with polling
const { runeInfo } = useRuneInfo("840000:3", { refreshInterval: 30000 });

// Get pools with manual refresh only
const { pools, refetch } = usePoolList({ autoRefresh: false });

// Search manually
const { runes, search } = useSearchRunes();
await search("BITCOIN");
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
  invoke, // Submit transactions
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
  const utxos = await client.getBtcUtxos();
} catch (error) {
  console.error("Failed to fetch UTXOs:", error);
}

// React hook error handling
const { getBtcBalance } = useRee();

const loadBalance = async () => {
  try {
    const balance = await getBtcBalance();
    setBalance(balance);
  } catch (error) {
    console.error("Failed to load balance:", error);
    setError(error.message);
  }
};
```

## Testing

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run coverage
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build the library
npm run build

# Preview the build
npm run preview
```

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- [Documentation](https://docs.omnity.network/docs/REE/introduction)
- [GitHub Issues](https://github.com/octopus-network/ree-ts-sdk/issues)
