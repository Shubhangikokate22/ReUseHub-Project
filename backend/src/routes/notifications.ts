import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.ts";

const router = Router();

function reportError(response: Response) {
  response.status(500).json({ error: "Could not process notifications." });
}

router.get("/", requireAuth, async (request, response) => {
  const recipientId = (request as AuthenticatedRequest).auth?.userId;
  const page = Number(request.query.page ?? 1);
  const limit = Number(request.query.limit ?? 20);
  const unreadOnly = request.query.unreadOnly === "true";
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." });
    return;
  }

  const where = { recipientId, ...(unreadOnly ? { readAt: null } : {}) };
  try {
    const [notifications, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true } },
          exchangeRequest: { select: { id: true, status: true, item: { select: { id: true, title: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { recipientId, readAt: null } }),
    ]);
    response.json({ notifications, unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    reportError(response);
  }
});

router.patch("/read-all", requireAuth, async (request, response) => {
  const recipientId = (request as AuthenticatedRequest).auth?.userId;
  try {
    const result = await prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    response.json({ updated: result.count });
  } catch {
    reportError(response);
  }
});

router.patch("/:id/read", requireAuth, async (request, response) => {
  const notificationId = request.params.id;
  if (typeof notificationId !== "string" || !notificationId.trim()) {
    response.status(400).json({ error: "Invalid notification id." });
    return;
  }
  const recipientId = (request as AuthenticatedRequest).auth?.userId;
  try {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const existing = await prisma.notification.findFirst({
        where: { id: notificationId, recipientId },
        select: { id: true, readAt: true },
      });
      if (!existing) {
        response.status(404).json({ error: "Notification not found." });
        return;
      }
      response.json({ notification: existing });
      return;
    }

    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, recipientId },
      select: { id: true, readAt: true },
    });
    response.json({ notification });
  } catch {
    reportError(response);
  }
});

export default router;
