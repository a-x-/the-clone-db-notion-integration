import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.{test,spec}.{js,ts}"],
    exclude: ["node_modules", "dist", ".vercel"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "test/", "dist/"],
    },
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
}); 
