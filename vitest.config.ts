import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    env: {
      NODE_ENV: "test",
    },
    clearMocks: true,
    restoreMocks: true,
  },
  define: {
    "process.env.NODE_ENV": '"test"',
  },
});
