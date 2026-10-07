import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.ts";

function getDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const url = new URL(connectionString);
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// protocol.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  return {
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: Number(url.searchParams.get("connection_limit")) || 5,
  };
}

const adapter = new PrismaMariaDb(getDatabaseConfig());

export const prisma = new PrismaClient({ adapter });
