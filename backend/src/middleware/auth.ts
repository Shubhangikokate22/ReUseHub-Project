import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { UserRole } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";

export type AuthenticatedRequest = Request & {
  auth?: { userId: string };
};

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const authRequest = request as AuthenticatedRequest;
  const authorization = request.header("authorization");
  const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    response.status(401).json({ error: "A valid Bearer token is required." });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      response.status(401).json({ error: "Invalid or expired token." });
      return;
    }
    authRequest.auth = { userId: payload.sub };
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired token." });
  }
}

export async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const userId = (request as AuthenticatedRequest).auth?.userId;
  if (!userId) {
    response.status(401).json({ error: "Authentication is required." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) {
      response.status(401).json({ error: "Authentication is required." });
      return;
    }
    if (user.role !== UserRole.ADMIN) {
      response.status(403).json({ error: "Administrator access is required." });
      return;
    }
    next();
  } catch {
    response.status(500).json({ error: "Could not verify administrator access." });
  }
}
