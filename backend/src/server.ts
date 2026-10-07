import "dotenv/config";

import cors from "cors";
import express from "express";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./database.ts";
import { getJwtSecret } from "./middleware/auth.ts";
import authRouter from "./routes/auth.ts";
import categoriesRouter from "./routes/categories.ts";
import itemsRouter from "./routes/items.ts";
import requestsRouter from "./routes/requests.ts";
import donationsRouter from "./routes/donations.ts";
import notificationsRouter from "./routes/notifications.ts";
import sustainabilityRouter from "./routes/sustainability.ts";
import adminRouter from "./routes/admin.ts";
import wishlistRouter from "./routes/wishlist.ts";
import chatsRouter from "./routes/chats.ts";
import communityRouter from "./routes/community.ts";
import { trackApiEfficiency } from "./services/runtime-metrics.ts";

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(trackApiEfficiency);
const uploadDirectory = path.resolve(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadDirectory, { index: false, maxAge: "1d" }));

app.use("/api/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/items", itemsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/sustainability", sustainabilityRouter);
app.use("/api/admin", adminRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/chats", chatsRouter);
app.use("/api/community", communityRouter);

app.get("/api/health", (_request, response) => {
  response.json({ success: true, message: "ReUseHub API is running" });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (response.headersSent) return;
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  response.status(status).json({ success: false, error: status >= 500 ? "An unexpected server error occurred." : "The request could not be completed." });
});

async function startServer() {
  try {
    getJwtSecret();
  } catch {
    console.error("JWT_SECRET is missing or too short; set it to a random secret of at least 32 characters.");
    process.exitCode = 1;
    return;
  }

  try {
    await mkdir(uploadDirectory, { recursive: true });
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;

    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`ReUseHub API listening on port ${port}`);
    });

    const shutdown = () => {
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error("Could not connect to MySQL. Check that MySQL is running and DATABASE_URL is valid.");
    if (error && typeof error === "object" && "code" in error) {
      console.error(`Database error code: ${String(error.code)}`);
    }
    await prisma.$disconnect();
    process.exitCode = 1;
  }
}

void startServer();
