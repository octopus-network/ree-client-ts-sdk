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

### Basic Usage

```typescript
import { ReeClient, Network } from '@ree-network/ts-sdk';

const config = {
  network: Network.Testnet,
  maestroApiKey: 'your-maestro-api-key',
  exchangeIdlFactory: yourExchangeIdlFactory,
  exchangeCanisterId: 'your-canister-id',
};

const client = new ReeClient(
  'bc1q...', // Bitcoin address
  'bc1q...', // Payment address
  config
);

// Get Bitcoin UTXOs
const utxos = await client.getBtcUtxos();

// Get Rune UTXOs
const runeUtxos = await client.getRuneUtxosByAddress('RUNE_ID');
```

### React Integration

```tsx
import { ReeProvider, useRee } from '@ree-network/ts-sdk';

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
      address: 'bc1q...',
      paymentAddress: 'bc1q...',
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
import { LaserEyesProvider, useLaserEyes } from '@omnisat/lasereyes-core';
import { ReeProvider, useRee } from '@ree-network/ts-sdk';

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
- `getRuneUtxosByAddress(runeId: string)`: Get Rune UTXOs for a specific Rune ID
- `getPoolInfo(poolId: string)`: Get information about a liquidity pool
- `createSwapTransaction(params)`: Create a swap transaction

### React Hooks

#### useRee()

Returns the current Ree context with client instance and wallet state.

```typescript
const {
  client,           // ReeClient instance or null
  address,          // Current Bitcoin address
  paymentAddress,   // Current payment address
  publicKey,        // Public key
  paymentPublicKey, // Payment public key
  updateWallet,     // Function to update wallet state
} = useRee();
```

### Configuration

```typescript
interface Config {
  network: Network;                    // Network.Mainnet or Network.Testnet
  maestroApiKey: string;              // Your Maestro API key
  exchangeIdlFactory: IDL.InterfaceFactory; // Exchange canister IDL
  exchangeCanisterId: string;         // Exchange canister ID
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
  console.error('Failed to fetch UTXOs:', error);
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

## Requirements

- Node.js 18+
- React 18+ (for React integration)
- TypeScript 5+

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

## Changelog

### v0.0.1
- Initial release
- Basic Bitcoin and Rune support
- React integration
- TypeScript support