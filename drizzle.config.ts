import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle-mysql",
  schema: "./db/schema.ts",
  dialect: "mysql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/kantong_rantau" },
});
