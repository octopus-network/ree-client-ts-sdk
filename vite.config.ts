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
      fileName: "ree-sdk",
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
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "React",
          "bitcoinjs-lib": "bitcoin",
          axios: "axios",
          graphql: "GraphQL",
        },
      },
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
      beforeWriteFile: (filePath, content) => {
        const updatedContent = content
          .replace(
            /import\([^)]*\/node_modules\/@types\/react[^)]*\)/g,
            'import("react")'
          )
          .replace(
            /from\s+["'][^"']*\/node_modules\/@types\/react[^"']*["']/g,
            'from "react"'
          )
          .replace(
            /import\s+\*\s+as\s+bitcoin\s+from\s+["']bitcoinjs-lib["']/g,
            'import * as bitcoin from "bitcoinjs-lib"'
          );
        return { filePath, content: updatedContent };
      },
    }),
  ],
});
