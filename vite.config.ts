import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
      process: "process/browser",
      util: "util",
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ree-sdk",
      fileName: (format) => `ree-sdk.${format}.js`,
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@types/react",
        "@types/react-dom",
        "bitcoinjs-lib",
        "@dfinity/agent",
        "@dfinity/candid",
        "axios",
        "graphql",
        "runelib",
      ],
      output: [
        {
          format: "es",
          exports: "named",
          globals: {
            "bitcoinjs-lib": "bitcoin",
          },
          interop: "auto",
          manualChunks: undefined,
        },
        {
          format: "cjs",
          exports: "named",
          interop: "auto",
        },
      ],
    },
  },
  optimizeDeps: {
    include: ["buffer", "process"],
  },
  plugins: [
    dts({
      rollupTypes: true,
      exclude: ["**/*.test.*", "**/*.spec.*"],
      compilerOptions: {
        skipLibCheck: true,
      },
    }),
  ],
});
