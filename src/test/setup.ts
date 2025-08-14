import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
    })),
  },
}));

// Mock @dfinity/agent
vi.mock('@dfinity/agent', () => ({
  Actor: {
    createActor: vi.fn(),
  },
  HttpAgent: {
    createSync: vi.fn(),
  },
}));