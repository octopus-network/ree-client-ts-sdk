import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ReeProvider, useRee } from './ReeProvider';
import type { Config } from '../types/config';
import { Network } from '../types/network';

const mockConfig: Config = {
  network: Network.Testnet,
  maestroApiKey: 'test-key',
  exchangeIdlFactory: vi.fn(),
  exchangeCanisterId: 'test-id',
};

function TestComponent() {
  const { client, address, paymentAddress, updateWallet } = useRee();
  
  return (
    <div>
      <div data-testid="address">{address}</div>
      <div data-testid="payment-address">{paymentAddress}</div>
      <div data-testid="client-status">{client ? 'connected' : 'disconnected'}</div>
      <button 
        onClick={() => updateWallet({ 
          address: 'bc1qtest', 
          paymentAddress: 'bc1qpayment' 
        })}
        data-testid="update-wallet"
      >
        Update Wallet
      </button>
    </div>
  );
}

describe('ReeProvider', () => {
  it('should provide initial empty state', () => {
    render(
      <ReeProvider config={mockConfig}>
        <TestComponent />
      </ReeProvider>
    );

    expect(screen.getByTestId('address')).toHaveTextContent('');
    expect(screen.getByTestId('payment-address')).toHaveTextContent('');
    expect(screen.getByTestId('client-status')).toHaveTextContent('disconnected');
  });

  it('should update wallet state and create client', async () => {
    render(
      <ReeProvider config={mockConfig}>
        <TestComponent />
      </ReeProvider>
    );

    await act(async () => {
      screen.getByTestId('update-wallet').click();
    });

    expect(screen.getByTestId('address')).toHaveTextContent('bc1qtest');
    expect(screen.getByTestId('payment-address')).toHaveTextContent('bc1qpayment');
    expect(screen.getByTestId('client-status')).toHaveTextContent('connected');
  });

  // it('should throw error when useRee is used outside provider', () => {
  //   expect(() => {
  //     render(<TestComponent />);
  //   }).toThrow('useRee must be used within ReeProvider');
  // });
});