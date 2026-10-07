import { Router } from "express";
import { RequestStatus } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.ts";

const router = Router();

router.get("/", requireAuth, async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth!.userId;
  try {
    const requests = await prisma.exchangeRequest.findMany({
      where: { OR: [{ ownerId: userId }, { requesterId: userId }], status: { in: [RequestStatus.ACCEPTED, RequestStatus.COMPLETED] } },
      include: {
        item: { include: { category: { select: { id: true, name: true, slug: true } }, images: { orderBy: { createdAt: "asc" }, take: 1 } } },
        owner: { select: { id: true, name: true } }, requester: { select: { id: true, name: true } },
        chat: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, name: true } } } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const chatIds = requests.flatMap((entry) => entry.chat ? [entry.chat.id] : []);
    const unreadGroups = chatIds.length ? await prisma.chatMessage.groupBy({
      by: ["chatId"],
      where: { chatId: { in: chatIds }, senderId: { not: userId }, readAt: null },
      _count: { _all: true },
    }) : [];
    const unread = new Map(unreadGroups.map((entry) => [entry.chatId, entry._count._all]));
    const conversations = requests.map((entry) => ({
      requestId: entry.id,
      status: entry.status,
      item: entry.item,
      owner: entry.owner,
      requester: entry.requester,
      participant: entry.ownerId === userId ? entry.requester : entry.owner,
      lastMessage: entry.chat?.messages[0] ?? null,
      unreadCount: entry.chat ? unread.get(entry.chat.id) ?? 0 : 0,
    }));
    response.json({ conversations, unreadCount: conversations.reduce((sum, entry) => sum + entry.unreadCount, 0) });
  } catch { response.status(500).json({ error: "Could not load your conversations." }); }
});

async function authorizedRequest(requestId: string, userId: string) {
  const exchangeRequest = await prisma.exchangeRequest.findUnique({ where: { id: requestId } });
  if (!exchangeRequest || (exchangeRequest.ownerId !== userId && exchangeRequest.requesterId !== userId)) return { error: 404 as const };
  if (exchangeRequest.status !== RequestStatus.ACCEPTED && exchangeRequest.status !== RequestStatus.COMPLETED) return { error: 409 as const };
  return { exchangeRequest };
}

router.get("/:requestId/messages", requireAuth, async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth!.userId;
  try {
    const access = await authorizedRequest(request.params.requestId!, userId);
    if ("error" in access) { response.status(access.error).json({ error: access.error === 404 ? "Conversation not found for this user." : "Chat opens after a request is accepted." }); return; }
    const chat = await prisma.chat.upsert({ where: { exchangeRequestId: access.exchangeRequest.id }, create: { exchangeRequestId: access.exchangeRequest.id }, update: {} });
    await prisma.chatMessage.updateMany({ where: { chatId: chat.id, senderId: { not: userId }, readAt: null }, data: { readAt: new Date() } });
    const messages = await prisma.chatMessage.findMany({ where: { chatId: chat.id }, include: { sender: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" }, take: 200 });
    response.json({ messages, request: { status: access.exchangeRequest.status } });
  } catch { response.status(500).json({ error: "Could not load this conversation." }); }
});

router.post("/:requestId/messages", requireAuth, async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth!.userId;
  const body = typeof request.body?.body === "string" ? request.body.body.trim() : "";
  if (!body || body.length > 2000) { response.status(400).json({ error: "Message must be 1 to 2,000 characters." }); return; }
  try {
    const access = await authorizedRequest(request.params.requestId!, userId);
    if ("error" in access) { response.status(access.error).json({ error: access.error === 404 ? "Conversation not found for this user." : "Chat opens after a request is accepted." }); return; }
    if (access.exchangeRequest.status === RequestStatus.COMPLETED) { response.status(409).json({ error: "This transaction is complete. The chat is read-only." }); return; }
    const chat = await prisma.chat.upsert({ where: { exchangeRequestId: access.exchangeRequest.id }, create: { exchangeRequestId: access.exchangeRequest.id }, update: {} });
    const message = await prisma.$transaction(async (tx) => {
      const active = await tx.exchangeRequest.updateMany({ where: { id: access.exchangeRequest.id, status: RequestStatus.ACCEPTED }, data: { updatedAt: new Date() } });
      if (!active.count) return null;
      const row = await tx.chatMessage.create({ data: { chatId: chat.id, senderId: userId, body }, include: { sender: { select: { id: true, name: true } } } });
      const recipientId = access.exchangeRequest.ownerId === userId ? access.exchangeRequest.requesterId : access.exchangeRequest.ownerId;
      const item = await tx.item.findUnique({ where: { id: access.exchangeRequest.itemId }, select: { title: true } });
      await tx.notification.create({ data: { recipientId, actorId: userId, exchangeRequestId: access.exchangeRequest.id, type: "CHAT_MESSAGE", message: `${row.sender.name} sent a message about ${item?.title ?? "your item"}.` } });
      return row;
    });
    if (!message) { response.status(409).json({ error: "This transaction is complete. The chat is read-only." }); return; }
    response.status(201).json({ message });
  } catch { response.status(500).json({ error: "Could not send this message." }); }
});

export default router;
