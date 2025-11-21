import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        react: resolve(__dirname, "src/react.ts"),
      },
      name: "ree-sdk",
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [
        "react", 
        "react-dom", 
        "react/jsx-runtime",
        "react/jsx-dev-runtime"
      ],
      output: [
        {
          format: "es",
          exports: "named",
          globals: {
            "bitcoinjs-lib": "bitcoin",
            "react": "React",
            "react-dom": "ReactDOM",
            "react/jsx-runtime": "jsxRuntime"
          },
          interop: "auto",
          manualChunks: undefined,
        },
        {
          format: "cjs",
          exports: "named",
          globals: {
            "react": "React",
            "react-dom": "ReactDOM", 
            "react/jsx-runtime": "jsxRuntime"
          },
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
