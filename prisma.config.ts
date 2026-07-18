import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "nightdesk/prisma/schema.prisma",
  datasource: {
    url: process.env.NIGHTDESK_DATABASE_URL ?? "postgresql://pending:pending@localhost:5432/pending",
  },
});
