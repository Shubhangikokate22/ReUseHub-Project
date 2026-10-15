import "dotenv/config";
import { defineConfig, env } from "prisma/config";

function getDatasourceUrl() {
  const databaseUrl = new URL(env("DATABASE_URL"));

  // TiDB Cloud Starter requires TLS. Prisma's CLI (including migrate deploy)
  // uses this URL independently from the MariaDB adapter in database.ts.
  // Require certificate verification for remote deployments when TLS is on.
  if (
    process.env.DATABASE_SSL === "true" &&
    !databaseUrl.searchParams.has("sslaccept")
  ) {
    databaseUrl.searchParams.set("sslaccept", "strict");
  }

  return databaseUrl.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatasourceUrl(),
  },
});
