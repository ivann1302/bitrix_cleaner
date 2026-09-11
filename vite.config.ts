import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, ".worktrees/**"],
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
  },
});
