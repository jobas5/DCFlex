import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export interface CloudflareDatabaseEnv {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DASHBOARD_URL?: string;
}

// Production data access must go through the D1 binding; do not persist app data on disk.
export function getDb(env: CloudflareDatabaseEnv) {
  return drizzle(env.DB, { schema });
}
