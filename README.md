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
import { ReeClient, Network } from "@ree-network/ts-sdk";

const config = {
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
const runeUtxos = await client.getRuneUtxosByAddress("RUNE_ID");

// Get Rune Info
const runeInfo = await client.getRuneInfo("RUNE_ID");

// Get Bitcoin Balance
const btcBalance = await client.getBtcBalance();

// Get Rune Balance
const runeBalance = await client.getRuneBalance("RUNE_ID");
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
  const { client, address, updateWallet } = useRee();

  const connectWallet = () => {
    updateWallet({
      address: "bc1q...",
      paymentAddress: "bc1q...",
    });
  };

  if (!client) {
    return <button onClick={connectWallet}>Connect Wallet</button>;
  }

  return <div>Connected: {address}</div>;
}
```

### Integration with LaserEyes

```tsx
import { LaserEyesProvider, useLaserEyes } from "@omnisat/lasereyes-core";
import { ReeProvider, useRee } from "@ree-network/ts-sdk";

function App() {
  return (
    <LaserEyesProvider config={laserEyesConfig}>
      <ReeWrapper>
        <MyComponent />
      </ReeWrapper>
    </LaserEyesProvider>
  );
}

function ReeWrapper({ children }) {
  const { address, paymentAddress, connected } = useLaserEyes();
  const { updateWallet } = useRee();

  useEffect(() => {
    updateWallet({
      address,
      paymentAddress,
    });
  }, [address, paymentAddress]);

  return <>{children}</>;
}

function MyComponent() {
  const { client, isConnected } = useRee();

  if (!isConnected || !client) {
    return <div>Please connect your wallet</div>;
  }

  return <div>Ready to trade!</div>;
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

- `getBtcUtxos()`: Get Bitcoin UTXOs for the payment address
- `getRuneUtxos(runeId: string)`: Get UTXOs containing a specific rune
- `searchRunes(keyword: string)`: Search for runes by keyword or rune ID
- `getRuneInfo(runeId: string)`: Get detailed information for a specific rune
- `getPoolInfo(poolId: string)`: Get information about a liquidity pool

### React Hooks

#### useRee()

Returns the current Ree context with client instance and wallet state.

```typescript
const {
  client, // ReeClient instance or null
  address, // Current Bitcoin address
  paymentAddress, // Current payment address
  updateWallet, // Function to update wallet state
} = useRee();
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

## Networks

- `Network.Mainnet`: Bitcoin mainnet
- `Network.Testnet`: Bitcoin testnet

## Error Handling

```typescript
try {
  const utxos = await client.getBtcUtxos();
} catch (error) {
  console.error("Failed to fetch UTXOs:", error);
}
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
