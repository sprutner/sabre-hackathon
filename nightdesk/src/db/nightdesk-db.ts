// Night Desk DB — Prisma over the Supabase session pooler (NIGHTDESK_DATABASE_URL).

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!prisma) {
    const url = process.env.NIGHTDESK_DATABASE_URL;
    if (!url) throw new Error("NIGHTDESK_DATABASE_URL missing — paste the Session pooler URI from the Supabase dashboard into .env");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  return prisma;
}
