import { Router } from "express";
import type { Response } from "express";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { RequestStatus, ItemStatus, ExchangeType, SustainabilityEventType } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { getJwtSecret, type AuthenticatedRequest, requireAuth } from "../middleware/auth.ts";
import { calculateLifecycleImpact, getDisplacementFactor, resolveEmissionFactor } from "../services/sustainability.ts";

const router = Router();
const statuses = Object.values(RequestStatus);
const requestInclude = {
  item: { include: { category: { select: { id: true, name: true, slug: true } }, images: { orderBy: { createdAt: "asc" as const } } } },
  offeredItem: { include: { category: { select: { id: true, name: true, slug: true } }, images: { orderBy: { createdAt: "asc" as const } } } },
  requester: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  ratings: { select: { id: true, authorId: true, targetId: true, score: true, feedback: true } },
};

function publicRequest<T extends Record<string, unknown>>(row: T): Omit<T, "handoverCodeHash" | "handoverCodeAttempts" | "handoverLockedUntil" | "activeItemId" | "activeOfferedItemId"> {
  const { handoverCodeHash: _hash, handoverCodeAttempts: _attempts, handoverLockedUntil: _lock, activeItemId: _activeItem, activeOfferedItemId: _activeOffer, ...safe } = row;
  return safe;
}

class RequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getUserId(request: AuthenticatedRequest): string | undefined {
  return request.auth?.userId;
}

function handoverDigest(requestId: string, code: string) {
  return createHmac("sha256", getJwtSecret()).update(`${requestId}:${code}`).digest("hex");
}

function validCampusDateTime(date: unknown, time: unknown): boolean {
  if (typeof date !== "string" || typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const parsed = new Date(`${date}T${time}:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && parsed.getTime() > Date.now();
}

const handoverPoints = ["MAIN_GATE", "LIBRARY", "CANTEEN", "ACADEMIC_BLOCK", "HOSTEL", "LAB_BLOCK", "OTHER"];

function reportError(response: Response, error: unknown) {
  if (error instanceof RequestError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Could not process the exchange request." });
}

router.get("/", requireAuth, async (request, response) => {
  const userId = getUserId(request as AuthenticatedRequest);
  const direction = typeof request.query.direction === "string" ? request.query.direction : "all";
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  const page = Number(request.query.page ?? 1);
  const limit = Number(request.query.limit ?? 20);

  if (!["all", "sent", "received"].includes(direction)) {
    response.status(400).json({ error: "Direction must be all, sent, or received." });
    return;
  }
  if (status && !statuses.includes(status as never)) {
    response.status(400).json({ error: "Choose a valid request status." });
    return;
  }
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." });
    return;
  }

  const participation = direction === "sent"
    ? { requesterId: userId }
    : direction === "received"
      ? { ownerId: userId }
      : { OR: [{ requesterId: userId }, { ownerId: userId }] };
  const where = { ...participation, ...(status ? { status: status as (typeof RequestStatus)[keyof typeof RequestStatus] } : {}) };

  try {
    const [requests, total] = await prisma.$transaction([
      prisma.exchangeRequest.findMany({ where, include: requestInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.exchangeRequest.count({ where }),
    ]);
    response.json({ requests: requests.map((row) => publicRequest(row as unknown as Record<string, unknown>)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    reportError(response, error);
  }
});

router.post("/", requireAuth, async (request, response) => {
  const requesterId = getUserId(request as AuthenticatedRequest)!;
  const { itemId, offeredItemId } = request.body ?? {};
  const rawMessage = request.body?.message;
  if (typeof itemId !== "string" || !itemId.trim()) {
    response.status(400).json({ error: "An item is required." });
    return;
  }
  if (rawMessage !== undefined && rawMessage !== null && typeof rawMessage !== "string") {
    response.status(400).json({ error: "Message must be text." });
    return;
  }
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (message.length > 1000) {
    response.status(400).json({ error: "Message must be 1,000 characters or fewer." });
    return;
  }

  try {
    const exchangeRequest = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: itemId }, select: { id: true, ownerId: true, status: true, exchangeType: true, activeExchangeRequestId: true } });
      if (!item) throw new RequestError(404, "Item not found.");
      if (item.ownerId === requesterId) throw new RequestError(400, "You cannot request your own item.");
      if (item.exchangeType === ExchangeType.EXCHANGE && (typeof offeredItemId !== "string" || !offeredItemId.trim())) throw new RequestError(400, "Choose one of your available items to offer for this exchange.");
      if (item.exchangeType !== ExchangeType.EXCHANGE && offeredItemId != null) throw new RequestError(400, "Offered items are only valid for exchange listings.");
      let offer: { id: string; ownerId: string; status: ItemStatus } | null = null;
      if (item.exchangeType === ExchangeType.EXCHANGE) {
        offer = await tx.item.findUnique({ where: { id: offeredItemId }, select: { id: true, ownerId: true, status: true, activeExchangeRequestId: true } });
        if (!offer || offer.ownerId !== requesterId) throw new RequestError(400, "The offered item must belong to you.");
        if (offer.ownerId === item.ownerId) throw new RequestError(400, "The requester and item holder must be different users.");
        if ((offer.status !== ItemStatus.AVAILABLE && offer.status !== ItemStatus.REQUESTED) || offer.activeExchangeRequestId) throw new RequestError(409, "The offered item is no longer available.");
        const offerLock = await tx.exchangeRequest.findFirst({ where: { OR: [{ activeItemId: offer.id }, { activeOfferedItemId: offer.id }] }, select: { id: true } });
        if (offerLock) throw new RequestError(409, "The offered item is already part of an active transaction.");
      }

      const duplicate = await tx.exchangeRequest.findFirst({
        where: { itemId, requesterId, status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED] } },
        select: { id: true },
      });
      if (duplicate) throw new RequestError(409, "You already have an active request for this item.");
      if ((item.status !== ItemStatus.AVAILABLE && item.status !== ItemStatus.REQUESTED) || item.activeExchangeRequestId) throw new RequestError(409, "This item is no longer available.");
      const active = await tx.exchangeRequest.findFirst({ where: { OR: [{ activeItemId: itemId }, { activeOfferedItemId: itemId }] }, select: { id: true } });
      if (active) throw new RequestError(409, "This listing already has an active transaction.");
      await tx.item.updateMany({ where: { id: itemId, activeExchangeRequestId: null, status: { in: [ItemStatus.AVAILABLE, ItemStatus.REQUESTED] } }, data: { status: ItemStatus.REQUESTED } });
      const refreshedItem = await tx.item.findUnique({ where: { id: itemId }, select: { status: true, activeExchangeRequestId: true } });
      const refreshedActive = await tx.exchangeRequest.findFirst({ where: { OR: [{ activeItemId: itemId }, { activeOfferedItemId: itemId }] }, select: { id: true } });
      if (!refreshedItem || refreshedItem.status !== ItemStatus.REQUESTED || refreshedItem.activeExchangeRequestId || refreshedActive) throw new RequestError(409, "This item is no longer accepting requests.");

      const created = await tx.exchangeRequest.create({
        data: { itemId, ...(offer ? { offeredItemId: offer.id } : {}), requesterId, ownerId: item.ownerId, ...(message ? { message } : {}) },
        include: requestInclude,
      });
      await tx.itemLifecycleEvent.create({ data: { itemId, exchangeRequestId: created.id, actorId: requesterId, event: item.exchangeType === ExchangeType.SALE ? "PURCHASE_REQUESTED" : item.exchangeType === ExchangeType.DONATION ? "DONATION_REQUESTED" : "REQUEST_RECEIVED" } });
      await tx.notification.create({
        data: {
          recipientId: item.ownerId,
          actorId: requesterId,
          exchangeRequestId: created.id,
          type: "EXCHANGE_REQUEST_RECEIVED",
          message: `${created.requester.name} requested “${created.item.title}”${created.offeredItem ? ` and offered “${created.offeredItem.title}”` : ""}.`,
        },
      });
      return created;
    });
    response.status(201).json({ request: exchangeRequest });
  } catch (error) {
    reportError(response, error);
  }
});

router.post("/:id/accept", requireAuth, async (request, response) => {
  const ownerId = getUserId(request as AuthenticatedRequest)!;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || current.ownerId !== ownerId) throw new RequestError(404, "Request not found for this owner.");
      if (current.status !== RequestStatus.PENDING) throw new RequestError(409, "Only pending requests can be accepted.");
      const item = await tx.item.findUnique({ where: { id: current.itemId }, select: { status: true, exchangeType: true } });
      if (!item || item.status !== ItemStatus.REQUESTED) throw new RequestError(409, "The listing is no longer available to accept.");
      if (item.exchangeType === ExchangeType.EXCHANGE && !current.offeredItemId) throw new RequestError(409, "This older exchange request has no offered item. Ask the student to submit a new request with an item to offer.");
      const active = await tx.exchangeRequest.findFirst({ where: { OR: [{ activeItemId: current.itemId }, { activeOfferedItemId: current.itemId }] }, select: { id: true } });
      if (active) throw new RequestError(409, "Another request already has an active transaction for this listing.");

      if (current.offeredItemId) {
        const offer = await tx.item.findUnique({ where: { id: current.offeredItemId }, select: { ownerId: true, status: true } });
        if (!offer || offer.ownerId !== current.requesterId || (offer.status !== ItemStatus.AVAILABLE && offer.status !== ItemStatus.REQUESTED)) throw new RequestError(409, "The offered item is no longer available to exchange.");
        const offerLock = await tx.exchangeRequest.findFirst({ where: { OR: [{ activeItemId: current.offeredItemId }, { activeOfferedItemId: current.offeredItemId }] }, select: { id: true } });
        if (offerLock) throw new RequestError(409, "The offered item is already part of another active transaction.");
      }
      const lockItemIds = [current.itemId, ...(current.offeredItemId ? [current.offeredItemId] : [])].sort();
      for (const lockItemId of lockItemIds) {
        const locked = await tx.item.updateMany({ where: { id: lockItemId, activeExchangeRequestId: null, status: { in: [ItemStatus.AVAILABLE, ItemStatus.REQUESTED] } }, data: { status: ItemStatus.REQUESTED, activeExchangeRequestId: current.id } });
        if (!locked.count) throw new RequestError(409, "One of the items is already part of another active transaction.");
      }

      const result = await tx.exchangeRequest.updateMany({
        where: { id: current.id, ownerId, status: RequestStatus.PENDING },
        data: { status: RequestStatus.ACCEPTED, activeItemId: current.itemId, activeOfferedItemId: current.offeredItemId },
      });
      if (!result.count) throw new RequestError(409, "This request has already been handled.");
      await tx.itemLifecycleEvent.create({ data: { itemId: current.itemId, exchangeRequestId: current.id, actorId: ownerId, event: "REQUEST_ACCEPTED" } });
      await tx.chat.upsert({ where: { exchangeRequestId: current.id }, create: { exchangeRequestId: current.id }, update: {} });
      await tx.notification.create({
        data: { recipientId: current.requesterId, actorId: ownerId, exchangeRequestId: current.id, type: "EXCHANGE_REQUEST_ACCEPTED", message: "Your exchange request was accepted." },
      });
      const otherPending = await tx.exchangeRequest.findMany({ where: { itemId: current.itemId, id: { not: current.id }, status: RequestStatus.PENDING }, select: { id: true, requesterId: true } });
      if (otherPending.length) await tx.notification.createMany({ data: otherPending.map((entry) => ({ recipientId: entry.requesterId, actorId: ownerId, exchangeRequestId: entry.id, type: "REQUEST_STILL_PENDING", message: "Another request is active for this listing. Your request is still visible to the holder." })) });
      return tx.exchangeRequest.findUnique({ where: { id: current.id }, include: requestInclude });
    });
    response.json({ request: updated });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") { response.status(409).json({ error: "This item is already involved in an active transaction." }); return; }
    reportError(response, error);
  }
});

router.post("/:id/handover", requireAuth, async (request, response) => {
  const ownerId = getUserId(request as AuthenticatedRequest)!;
  const { meetingPoint, otherPoint, date, time } = request.body ?? {};
  const customPoint = typeof otherPoint === "string" ? otherPoint.trim() : "";
  if (typeof meetingPoint !== "string" || !handoverPoints.includes(meetingPoint) || (meetingPoint === "OTHER" && (!/^[\p{L}\p{N} '-]{2,50}$/u.test(customPoint) || /\b(address|street|road|avenue|lane|phone|near)\b/i.test(customPoint))) || (meetingPoint !== "OTHER" && otherPoint != null && otherPoint !== "") || !validCampusDateTime(date, time)) {
    response.status(400).json({ error: "Choose a campus meeting point and a future date and time. Other must be a short campus location name." }); return;
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || current.ownerId !== ownerId) throw new RequestError(404, "Only the item holder can arrange this handover.");
      if (current.status !== RequestStatus.ACCEPTED || current.activeItemId !== current.itemId) throw new RequestError(409, "Handover can only be arranged for the active accepted request.");
      if (current.handoverStatus && current.handoverStatus !== "REJECTED") throw new RequestError(409, "Wait for the requester to respond to the current proposal.");
      const updated = await tx.exchangeRequest.update({ where: { id: current.id }, data: {
        handoverMeetingPoint: meetingPoint,
        handoverOtherPoint: meetingPoint === "OTHER" ? customPoint : null,
        handoverDate: date,
        handoverTime: time,
        handoverStatus: "PROPOSED",
        handoverCodeHash: null,
        handoverCodeGeneratedAt: null,
        handoverCodeAttempts: 0,
        handoverLockedUntil: null,
      }, include: requestInclude });
      await tx.itemLifecycleEvent.create({ data: { itemId: current.itemId, exchangeRequestId: current.id, actorId: ownerId, event: "HANDOVER_PROPOSED", note: `${meetingPoint === "OTHER" ? customPoint : meetingPoint}; ${date}; ${time}` } });
      await tx.notification.create({ data: { recipientId: current.requesterId, actorId: ownerId, exchangeRequestId: current.id, type: "HANDOVER_PROPOSED", message: `A handover slot was proposed for ${date} at ${time}.` } });
      return updated;
    });
    response.json({ request: publicRequest(result as unknown as Record<string, unknown>) });
  } catch (error) { reportError(response, error); }
});

router.patch("/:id/handover/response", requireAuth, async (request, response) => {
  const requesterId = getUserId(request as AuthenticatedRequest)!;
  const decision = request.body?.decision;
  if (decision !== "ACCEPT" && decision !== "REJECT") { response.status(400).json({ error: "Choose accept or reject for this proposed slot." }); return; }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || current.requesterId !== requesterId) throw new RequestError(404, "Only the requester can respond to this handover proposal.");
      if (current.status !== RequestStatus.ACCEPTED || current.activeItemId !== current.itemId || current.handoverStatus !== "PROPOSED") throw new RequestError(409, "There is no active handover proposal to respond to.");
      const handoverStatus = decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
      const updated = await tx.exchangeRequest.update({ where: { id: current.id }, data: { handoverStatus, ...(decision === "REJECT" ? { handoverCodeHash: null, handoverCodeGeneratedAt: null } : {}) }, include: requestInclude });
      await tx.notification.create({ data: { recipientId: current.ownerId, actorId: requesterId, exchangeRequestId: current.id, type: decision === "ACCEPT" ? "HANDOVER_ACCEPTED" : "HANDOVER_REJECTED", message: decision === "ACCEPT" ? "The requester accepted the handover slot." : "The requester rejected the proposed slot. Arrange another slot." } });
      return updated;
    });
    response.json({ request: publicRequest(result as unknown as Record<string, unknown>) });
  } catch (error) { reportError(response, error); }
});

router.post("/:id/handover/code", requireAuth, async (request, response) => {
  const requesterId = getUserId(request as AuthenticatedRequest)!;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || current.requesterId !== requesterId) throw new RequestError(404, "Only the requester can generate their handover code.");
      if (current.status !== RequestStatus.ACCEPTED || current.activeItemId !== current.itemId || current.handoverStatus !== "ACCEPTED") throw new RequestError(409, "Accept a handover proposal before generating a code.");
      const code = randomInt(0, 10000).toString().padStart(4, "0");
      await tx.exchangeRequest.update({ where: { id: current.id }, data: { handoverCodeHash: handoverDigest(current.id, code), handoverCodeGeneratedAt: new Date(), handoverCodeAttempts: 0, handoverLockedUntil: null } });
      await tx.notification.create({ data: { recipientId: current.ownerId, actorId: requesterId, exchangeRequestId: current.id, type: "HANDOVER_READY", message: "The requester is ready for the scheduled handover." } });
      return code;
    });
    response.json({ code: result });
  } catch (error) { reportError(response, error); }
});

router.post("/:id/rating", requireAuth, async (request, response) => {
  const authorId = getUserId(request as AuthenticatedRequest)!;
  const score = request.body?.score;
  const feedback = request.body?.feedback;
  if (!Number.isInteger(score) || score < 1 || score > 5 || (feedback !== undefined && (typeof feedback !== "string" || feedback.trim().length > 1000))) {
    response.status(400).json({ error: "Score must be 1 to 5; feedback must be 1,000 characters or fewer." }); return;
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || (current.ownerId !== authorId && current.requesterId !== authorId)) throw new RequestError(404, "Request not found for this participant.");
      if (current.status !== RequestStatus.COMPLETED) throw new RequestError(409, "Only completed transactions can be rated.");
      const targetId = current.ownerId === authorId ? current.requesterId : current.ownerId;
      return tx.rating.create({ data: { exchangeRequestId: current.id, authorId, targetId, score, feedback: typeof feedback === "string" ? feedback.trim() || null : null } });
    });
    response.status(201).json({ rating: result });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") { response.status(409).json({ error: "You have already rated this transaction." }); return; }
    reportError(response, error);
  }
});

router.get("/reputation/:userId", async (request, response) => {
  try {
    const [aggregate, count] = await prisma.$transaction([
      prisma.rating.aggregate({ where: { targetId: request.params.userId }, _avg: { score: true } }),
      prisma.rating.count({ where: { targetId: request.params.userId } }),
    ]);
    response.json({ userId: request.params.userId, ratingCount: count, averageRating: aggregate._avg.score });
  } catch { response.status(500).json({ error: "Could not load user reputation." }); }
});

router.post("/:id/reject", requireAuth, async (request, response) => {
  const ownerId = getUserId(request as AuthenticatedRequest)!;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || current.ownerId !== ownerId) throw new RequestError(404, "Request not found for this owner.");
      if (current.status !== RequestStatus.PENDING) throw new RequestError(409, "Only pending requests can be rejected.");

      const result = await tx.exchangeRequest.updateMany({
        where: { id: current.id, ownerId, status: RequestStatus.PENDING },
        data: { status: RequestStatus.REJECTED },
      });
      if (!result.count) throw new RequestError(409, "This request has already been handled.");
      const otherOpen = await tx.exchangeRequest.count({ where: { itemId: current.itemId, status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED] } } });
      if (!otherOpen) await tx.item.updateMany({ where: { id: current.itemId, status: ItemStatus.REQUESTED }, data: { status: ItemStatus.AVAILABLE } });
      await tx.notification.create({
        data: { recipientId: current.requesterId, actorId: ownerId, exchangeRequestId: current.id, type: "EXCHANGE_REQUEST_REJECTED", message: "Your exchange request was declined." },
      });
      return tx.exchangeRequest.findUnique({ where: { id: current.id }, include: requestInclude });
    });
    response.json({ request: updated });
  } catch (error) {
    reportError(response, error);
  }
});

router.post("/:id/cancel", requireAuth, async (request, response) => {
  const actorId = getUserId(request as AuthenticatedRequest)!;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || (current.requesterId !== actorId && current.ownerId !== actorId)) throw new RequestError(404, "Request not found for this participant.");
      if (current.status !== RequestStatus.PENDING && current.status !== RequestStatus.ACCEPTED) throw new RequestError(409, "Only an active request or transaction can be cancelled.");

      const result = await tx.exchangeRequest.updateMany({
        where: { id: current.id, status: current.status },
        data: { status: RequestStatus.CANCELLED, activeItemId: null, activeOfferedItemId: null, handoverCodeHash: null },
      });
      if (!result.count) throw new RequestError(409, "This request has already been handled.");
      const otherOpen = await tx.exchangeRequest.count({ where: { itemId: current.itemId, status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED] } } });
      if (current.status === RequestStatus.ACCEPTED) await tx.item.updateMany({ where: { id: current.itemId, activeExchangeRequestId: current.id }, data: { status: otherOpen ? ItemStatus.REQUESTED : ItemStatus.AVAILABLE, activeExchangeRequestId: null } });
      else if (!otherOpen) await tx.item.updateMany({ where: { id: current.itemId, status: ItemStatus.REQUESTED, activeExchangeRequestId: null }, data: { status: ItemStatus.AVAILABLE } });
      if (current.status === RequestStatus.ACCEPTED && current.offeredItemId) {
        const offerOpen = await tx.exchangeRequest.count({ where: { itemId: current.offeredItemId, status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED] } } });
        await tx.item.updateMany({ where: { id: current.offeredItemId, status: ItemStatus.REQUESTED, activeExchangeRequestId: current.id }, data: { status: offerOpen ? ItemStatus.REQUESTED : ItemStatus.AVAILABLE, activeExchangeRequestId: null } });
      }
      const recipientId = actorId === current.requesterId ? current.ownerId : current.requesterId;
      await tx.notification.create({
        data: { recipientId, actorId, exchangeRequestId: current.id, type: "EXCHANGE_REQUEST_CANCELLED", message: "The active request was cancelled. Other pending requests may now be considered." },
      });
      if (current.status === RequestStatus.ACCEPTED) {
        const otherPending = await tx.exchangeRequest.findMany({ where: { itemId: { in: [current.itemId, ...(current.offeredItemId ? [current.offeredItemId] : [])] }, status: RequestStatus.PENDING }, select: { id: true, requesterId: true } });
        if (otherPending.length) await tx.notification.createMany({ data: otherPending.map((entry) => ({ recipientId: entry.requesterId, actorId, exchangeRequestId: entry.id, type: "REQUEST_ELIGIBLE", message: "The active transaction was cancelled. The holder may now consider your request." })) });
      }
      return tx.exchangeRequest.findUnique({ where: { id: current.id }, include: requestInclude });
    });
    response.json({ request: updated });
  } catch (error) {
    reportError(response, error);
  }
});

router.post("/:id/complete", requireAuth, async (request, response) => {
  const userId = getUserId(request as AuthenticatedRequest)!;
  const code = typeof request.body?.code === "string" ? request.body.code : "";
  if (!/^\d{4}$/.test(code)) { response.status(400).json({ error: "Invalid handover code. Please try again." }); return; }
  try {
    const before = await prisma.exchangeRequest.findUnique({ where: { id: request.params.id } });
    if (!before || before.ownerId !== userId) throw new RequestError(404, "Only the item holder can verify the handover code.");
      if (before.status !== RequestStatus.ACCEPTED || before.activeItemId !== before.itemId || (before.offeredItemId && before.activeOfferedItemId !== before.offeredItemId) || before.handoverStatus !== "ACCEPTED" || !before.handoverDate || !before.handoverCodeHash) throw new RequestError(409, "The requester must accept a handover proposal and generate a code first.");
    if (before.handoverLockedUntil && before.handoverLockedUntil > new Date()) throw new RequestError(429, "Too many incorrect codes. Try again in 15 minutes.");
    const providedHash = handoverDigest(before.id, code);
    const expected = Buffer.from(before.handoverCodeHash, "hex");
    const supplied = Buffer.from(providedHash, "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      const attempts = before.handoverCodeAttempts + 1;
      await prisma.exchangeRequest.updateMany({ where: { id: before.id, status: RequestStatus.ACCEPTED, handoverCodeHash: before.handoverCodeHash }, data: { handoverCodeAttempts: attempts, ...(attempts >= 5 ? { handoverLockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {}) } });
      throw new RequestError(attempts >= 5 ? 429 : 400, attempts >= 5 ? "Too many incorrect codes. Try again in 15 minutes." : "Invalid handover code. Please try again.");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.exchangeRequest.findUnique({ where: { id: request.params.id } });
      if (!current || current.ownerId !== userId) throw new RequestError(404, "Only the item holder can complete this handover.");
      if (current.status !== RequestStatus.ACCEPTED) throw new RequestError(409, "Only accepted requests can be completed.");
      if (current.activeItemId !== current.itemId || (current.offeredItemId && current.activeOfferedItemId !== current.offeredItemId) || current.handoverStatus !== "ACCEPTED") throw new RequestError(409, "The handover has not been accepted by the requester.");
      if (!current.handoverCodeHash || current.handoverCodeHash !== before.handoverCodeHash) throw new RequestError(409, "This handover code has already been used. Refresh the request and try again.");

      const item = await tx.item.findUnique({ where: { id: current.itemId }, include: { category: { select: { slug: true } } } });
      if (!item) throw new RequestError(404, "The item for this request no longer exists.");
      const isDonation = item.exchangeType === ExchangeType.DONATION;
      const isSale = item.exchangeType === ExchangeType.SALE;
      const factorKey = resolveEmissionFactor(item.category.slug, item.title);
      const factor = factorKey ? await tx.emissionFactor.findUnique({ where: { category_subcategory: factorKey } }) : null;
      const impact = calculateLifecycleImpact({
        estimatedWeightKg: item.estimatedWeightKg === null ? null : Number(item.estimatedWeightKg),
        factorKgCO2e: factor?.factorKgCO2e == null ? null : Number(factor.factorKgCO2e),
        factorConfidence: factor?.confidenceLevel ?? null,
      });

      const result = await tx.exchangeRequest.updateMany({
        where: { id: current.id, status: RequestStatus.ACCEPTED, activeItemId: current.itemId, handoverStatus: "ACCEPTED", handoverCodeHash: before.handoverCodeHash },
        data: { status: RequestStatus.COMPLETED, handoverStatus: "COMPLETED", handoverCodeHash: null, activeItemId: null, activeOfferedItemId: null },
      });
      if (!result.count) throw new RequestError(409, "This request has already been completed.");
      const itemResult = await tx.item.updateMany({
        where: { id: current.itemId, status: ItemStatus.REQUESTED, activeExchangeRequestId: current.id },
        data: { status: isDonation ? ItemStatus.DONATED : isSale ? ItemStatus.SOLD : ItemStatus.EXCHANGED, activeExchangeRequestId: null },
      });
      if (!itemResult.count) throw new RequestError(409, "The item is no longer available to complete.");
      let offeredItem: { id: string; title: string } | null = null;
      if (current.offeredItemId) {
        offeredItem = await tx.item.findUnique({ where: { id: current.offeredItemId }, select: { id: true, title: true } });
        if (!offeredItem) throw new RequestError(404, "The offered item no longer exists.");
        const offerResult = await tx.item.updateMany({ where: { id: offeredItem.id, status: ItemStatus.REQUESTED, activeExchangeRequestId: current.id }, data: { status: ItemStatus.EXCHANGED, activeExchangeRequestId: null } });
        if (!offerResult.count) throw new RequestError(409, "The offered item is no longer available to complete the exchange.");
      }
      const otherPending = await tx.exchangeRequest.findMany({ where: { itemId: { in: [current.itemId, ...(offeredItem ? [offeredItem.id] : [])] }, id: { not: current.id }, status: RequestStatus.PENDING }, select: { id: true, requesterId: true, itemId: true } });
      if (otherPending.length) {
        await tx.exchangeRequest.updateMany({ where: { id: { in: otherPending.map((row) => row.id) }, status: RequestStatus.PENDING }, data: { status: RequestStatus.REJECTED } });
        await tx.notification.createMany({ data: otherPending.map((row) => ({ recipientId: row.requesterId, actorId: userId, exchangeRequestId: row.id, type: "REQUEST_NOT_SELECTED", message: "This listing has been completed with another request." })) });
      }
      await tx.itemLifecycleEvent.create({ data: { itemId: current.itemId, exchangeRequestId: current.id, actorId: userId, event: isDonation ? "DONATED" : isSale ? "SOLD" : "EXCHANGE_COMPLETED" } });
      if (offeredItem) await tx.itemLifecycleEvent.create({ data: { itemId: offeredItem.id, exchangeRequestId: current.id, actorId: userId, event: "EXCHANGE_COMPLETED", note: `Exchanged for ${item.title}` } });
      if (isDonation) {
        await tx.donation.create({ data: { itemId: current.itemId, donorId: current.ownerId } });
      }
      await tx.sustainabilityCalculation.create({
        data: {
          itemId: item.id,
          emissionFactorId: factor?.id,
          eventType: isDonation ? SustainabilityEventType.DONATION_COMPLETED : isSale ? SustainabilityEventType.SALE_COMPLETED : SustainabilityEventType.EXCHANGE_COMPLETED,
          referenceFactor: impact.referenceFactor,
          displacementFactor: impact.displacementFactor,
          baselineEmissions: impact.baselineEmissions,
          reuseScenarioEmissions: impact.reuseScenarioEmissions,
          transportEmissions: impact.transportEmissions,
          netAvoidedCO2e: impact.netAvoidedCO2e,
          confidenceLevel: impact.confidenceLevel,
          assumptions: impact.assumptions,
        },
      });
      await tx.sustainabilityMetric.createMany({
        data: [current.ownerId, current.requesterId].map((participantId) => ({
          userId: participantId,
          itemId: current.itemId,
          eventType: isDonation ? SustainabilityEventType.DONATION_COMPLETED : isSale ? SustainabilityEventType.SALE_COMPLETED : SustainabilityEventType.EXCHANGE_COMPLETED,
          estimatedWasteAvoidedKg: impact.estimatedWasteAvoidedKg,
          estimatedCo2eAvoidedKg: impact.netAvoidedCO2e,
        })),
      });
      if (isDonation) {
        await tx.notification.createMany({
          data: [current.ownerId, current.requesterId].map((participantId) => ({
            recipientId: participantId,
            actorId: userId,
            exchangeRequestId: current.id,
            type: "DONATION_COMPLETED",
            message: "The donation handoff was marked complete.",
          })),
        });
      } else {
        await tx.notification.create({
          data: {
            recipientId: current.requesterId,
            actorId: userId,
            exchangeRequestId: current.id,
            type: "EXCHANGE_COMPLETED",
            message: "The exchange was marked complete.",
          },
        });
      }
      return tx.exchangeRequest.findUnique({ where: { id: current.id }, include: requestInclude });
    });
    response.json({ request: updated });
  } catch (error) {
    reportError(response, error);
  }
});

export default router;
