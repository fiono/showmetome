import { defineConfig } from "vitest/config";

// Standalone config so vitest doesn't load the Cloudflare vite plugin;
// the tests cover pure functions in src/shared only.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
