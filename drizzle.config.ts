import { defineConfig } from "drizzle-kit"

// Migrations are generated from the schema and shipped with the app as a resource.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/main/core/db/schema.ts",
  out: "./resources/migrations",
})
