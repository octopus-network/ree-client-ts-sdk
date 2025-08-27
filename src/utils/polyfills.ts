// Browser polyfills for Node.js APIs

// Global polyfill
if (typeof global === 'undefined') {
  (globalThis as any).global = globalThis;
}

// Buffer polyfill
if (typeof Buffer === 'undefined') {
  const BufferPolyfill = {
    alloc: (size: number, fill?: any) => {
      const arr = new Uint8Array(size);
      if (fill !== undefined) {
        arr.fill(fill);
      }
      return arr;
    },
    from: (data: any, encoding?: string) => {
      if (typeof data === 'string') {
        if (encoding === 'hex') {
          const matches = data.match(/.{1,2}/g) || [];
          return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
        }
        return new TextEncoder().encode(data);
      }
      if (Array.isArray(data) || data instanceof Uint8Array) {
        return new Uint8Array(data);
      }
      return new Uint8Array(0);
    },
    isBuffer: (obj: any) => obj instanceof Uint8Array,
    concat: (arrays: Uint8Array[]) => {
      const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
      }
      return result;
    }
  };

  (globalThis as any).Buffer = BufferPolyfill;
}

// Process polyfill
if (typeof process === 'undefined') {
  (globalThis as any).process = {
    env: {},
    browser: true,
    version: '',
    versions: { node: '' }
  };
}