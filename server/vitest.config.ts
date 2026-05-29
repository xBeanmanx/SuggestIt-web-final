import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/resolvers/**/*.ts",
        "src/store-factory.ts",
        "src/validation.ts",
      ],
      exclude: ["src/tests/**"],
    },
  },
});
