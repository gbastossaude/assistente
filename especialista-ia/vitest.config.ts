import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/e2e/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
