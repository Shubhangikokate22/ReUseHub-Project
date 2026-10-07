import { Router } from "express";
import type { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, getJwtSecret, requireAuth } from "../middleware/auth.ts";

const router = Router();
const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

function issueToken(userId: string): string {
  return jwt.sign({}, getJwtSecret(), { subject: userId, expiresIn: "7d" });
}

function sendSafeUser(response: Response, user: object, status = 200) {
  response.status(status).json({ user });
}

router.post("/register", async (request, response) => {
  const { name, email, password } = request.body ?? {};

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    response.status(400).json({ error: "Name must be between 2 and 100 characters." });
    return;
  }

  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    response.status(400).json({ error: "Password must be at least 8 characters and no more than 72 UTF-8 bytes." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (existingUser) {
      response.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, password: passwordHash },
      select: safeUserSelect,
    });

    response.status(201).json({ token: issueToken(user.id), user });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      response.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    response.status(500).json({ error: "Could not create the account." });
  }
});

router.post("/login", async (request, response) => {
  const { email, password } = request.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    response.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }

    const { password: _passwordHash, ...safeUser } = user;
    response.json({ token: issueToken(user.id), user: safeUser });
  } catch {
    response.status(500).json({ error: "Could not log in." });
  }
});

router.get("/me", requireAuth, async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth?.userId;
  if (!userId) {
    response.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });
    if (!user) {
      response.status(401).json({ error: "Invalid or expired token." });
      return;
    }
    sendSafeUser(response, user);
  } catch {
    response.status(500).json({ error: "Could not load the current user." });
  }
});

router.put("/me", requireAuth, async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth?.userId;
  const { name, email } = request.body ?? {};
  const data: { name?: string; email?: string } = {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
      response.status(400).json({ error: "Name must be between 2 and 100 characters." });
      return;
    }
    data.name = name.trim();
  }
  if (email !== undefined) {
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      response.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    data.email = email.trim().toLowerCase();
  }
  if (!userId || !Object.keys(data).length) {
    response.status(400).json({ error: "Provide a name or email to update." });
    return;
  }
  try {
    const user = await prisma.user.update({ where: { id: userId }, data, select: safeUserSelect });
    response.json({ user });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      response.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    response.status(500).json({ error: "Could not update the account." });
  }
});

export default router;
