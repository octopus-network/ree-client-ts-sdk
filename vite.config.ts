import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/guide/build.html#library-mode
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ree-sdk",
      fileName: "ree-sdk",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "React",
        },
      },
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      exclude: ["**/*.test.*", "**/*.spec.*"],
    }),
  ],
});
