import { Buffer } from 'buffer';
import process from 'process';

// Global polyfill
if (typeof global === 'undefined') {
  (globalThis as any).global = globalThis;
}

// Buffer polyfill
if (typeof (globalThis as any).Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

// Process polyfill
if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = process;
}

export { Buffer, process };
