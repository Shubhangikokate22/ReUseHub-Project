import { Router } from "express";
import type { Response } from "express";
import { ItemStatus, RequestStatus, SustainabilityEventType } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { requireAdmin, requireAuth } from "../middleware/auth.ts";
import { validateCampaignSchedule } from "../services/campaign-schedule.ts";
import { detectImage, uploadImage } from "./items.ts";
import { ESTIMATE_LABEL, ESTIMATE_METHODOLOGY, summarizeCampusMetrics } from "../services/sustainability.ts";
import { getApiEfficiencyMetrics } from "../services/runtime-metrics.ts";
import { deleteStoredImage, storeImage } from "../services/image-storage.ts";

const router = Router();
const itemStatuses = Object.values(ItemStatus);
const eventTypes = Object.values(SustainabilityEventType);
const pageParameters = (request: { query: Record<string, unknown> }) => ({
  page: Number(request.query.page ?? 1),
  limit: Number(request.query.limit ?? 20),
});
const validPage = (page: number, limit: number) => Number.isInteger(page) && page >= 1 && Number.isInteger(limit) && limit >= 1 && limit <= 50;
const reportError = (response: Response) => response.status(500).json({ error: "Could not load administrator data." });

router.use(requireAuth, requireAdmin);

router.get("/stats", async (_request, response) => {
  try {
    const [totalUsers, totalItems, availableItems, exchangesCompleted, itemsDonated, itemsSold, metrics, calculations] = await prisma.$transaction([
      prisma.user.count(),
      prisma.item.count(),
      prisma.item.count({ where: { status: ItemStatus.AVAILABLE } }),
      prisma.exchangeRequest.count({ where: { status: RequestStatus.COMPLETED, item: { is: { exchangeType: "EXCHANGE" } } } }),
      prisma.donation.count(),
      prisma.item.count({ where: { status: ItemStatus.SOLD } }),
      prisma.sustainabilityMetric.findMany({ select: { itemId: true, eventType: true, estimatedWasteAvoidedKg: true, estimatedCo2eAvoidedKg: true } }),
      prisma.sustainabilityCalculation.findMany({ select: { itemId: true, netAvoidedCO2e: true } }),
    ]);
    const campusTotals = summarizeCampusMetrics(metrics);
    const co2eTotal = calculations.reduce((sum, calculation) => sum + (calculation.netAvoidedCO2e === null ? 0 : Number(calculation.netAvoidedCO2e)), 0);
    response.json({
      statistics: {
        totalUsers,
        totalItems,
        availableItems,
        exchangesCompleted,
        itemsDonated,
        itemsSold,
        co2eCalculationsAvailable: calculations.filter((entry) => entry.netAvoidedCO2e !== null).length,
        ...campusTotals,
        estimatedCo2eAvoidedKg: Math.round(co2eTotal * 1000) / 1000,
        label: ESTIMATE_LABEL,
        methodology: ESTIMATE_METHODOLOGY,
      },
    });
  } catch {
    reportError(response);
  }
});

router.get("/green-it", async (_request, response) => {
  try {
    const [images, available, requested, exchanged, sold, donated, removed] = await prisma.$transaction([
      prisma.itemImage.aggregate({ _count: { _all: true, storageSizeBytes: true }, _sum: { storageSizeBytes: true } }),
      prisma.item.count({ where: { status: ItemStatus.AVAILABLE } }),
      prisma.item.count({ where: { status: ItemStatus.REQUESTED } }),
      prisma.item.count({ where: { status: ItemStatus.EXCHANGED } }),
      prisma.item.count({ where: { status: ItemStatus.SOLD } }),
      prisma.item.count({ where: { status: ItemStatus.DONATED } }),
      prisma.item.count({ where: { status: ItemStatus.REMOVED } }),
    ]);
    const sizedImages = images._count.storageSizeBytes;
    const storedBytes = images._sum.storageSizeBytes ?? 0;
    response.json({
      measured: {
        imagesUploaded: images._count._all,
        imagesWithRecordedSize: sizedImages,
        imageStorageBytes: storedBytes,
        averageImageBytes: sizedImages ? Math.round(storedBytes / sizedImages) : null,
        api: getApiEfficiencyMetrics(),
        itemLifecycle: { available, requested, exchanged, sold, donated, removed },
      },
      estimatedStorageReductionPercent: null,
      notes: [
        "Image storage and response content-length counts are measured by this application.",
        "Original upload size is not recorded, so storage reduction percentage is unavailable.",
        "Pagination and client-side image resizing reduce data transfer by design; this endpoint does not claim energy savings.",
        "API request counts reset when the backend process restarts.",
      ],
    });
  } catch {
    reportError(response);
  }
});

router.get("/reports", async (request, response) => {
  const { page, limit } = pageParameters(request);
  if (!validPage(page, limit)) { response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." }); return; }
  try {
    const [reports, total] = await prisma.$transaction([
      prisma.itemReport.findMany({ include: { reporter: { select: { id: true, name: true } }, item: { select: { id: true, title: true, status: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.itemReport.count(),
    ]);
    response.json({ reports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch { reportError(response); }
});

router.patch("/reports/:id", async (request, response) => {
  const { status, resolution, removeItem } = request.body ?? {};
  if (! ["REVIEWING", "RESOLVED", "DISMISSED"].includes(status) || (resolution !== undefined && (typeof resolution !== "string" || resolution.length > 1000)) || (removeItem !== undefined && typeof removeItem !== "boolean")) {
    response.status(400).json({ error: "Choose REVIEWING, RESOLVED, or DISMISSED and optional resolution details." }); return;
  }
  try {
    const report = await prisma.itemReport.findUnique({ where: { id: request.params.id } });
    if (!report) { response.status(404).json({ error: "Report not found." }); return; }
    if (removeItem && report.itemId) {
      const active = await prisma.exchangeRequest.count({ where: { itemId: report.itemId, status: RequestStatus.ACCEPTED } });
      if (active) { response.status(409).json({ error: "Complete or cancel the accepted handoff before removing this listing." }); return; }
      await prisma.$transaction(async (tx) => {
        const pending = await tx.exchangeRequest.findMany({ where: { itemId: report.itemId!, status: RequestStatus.PENDING }, select: { id: true, requesterId: true } });
        if (pending.length) {
          await tx.exchangeRequest.updateMany({ where: { id: { in: pending.map((row) => row.id) }, status: RequestStatus.PENDING }, data: { status: RequestStatus.REJECTED } });
          await tx.notification.createMany({ data: pending.map((row) => ({ recipientId: row.requesterId, exchangeRequestId: row.id, type: "LISTING_REMOVED", message: "The listing was removed after administrator review." })) });
        }
        await tx.item.updateMany({ where: { id: report.itemId!, status: { in: [ItemStatus.AVAILABLE, ItemStatus.REQUESTED] } }, data: { status: ItemStatus.REMOVED } });
      });
    }
    const updated = await prisma.itemReport.update({ where: { id: report.id }, data: { status, resolution: typeof resolution === "string" ? resolution.trim() || null : null } });
    response.json({ report: updated, itemRemoved: Boolean(removeItem && report.itemId) });
  } catch { reportError(response); }
});

router.get("/campaigns", requireAuth, requireAdmin, async (_request, response) => {
  try {
    const campaigns = await prisma.donationCampaign.findMany({ include: { _count: { select: { contributions: true, donations: true } } }, orderBy: { createdAt: "desc" } });
    response.json({ campaigns });
  } catch { reportError(response); }
});

router.patch("/campaigns/:id", requireAuth, requireAdmin, async (request, response) => {
  const body = request.body ?? {};
  const data: Record<string, unknown> = {};
  for (const key of ["title", "description", "location", "instructions", "coordinator", "imageUrl"] as const) {
    if (body[key] !== undefined) {
      if (body[key] === null && !(["title", "description", "neededItems", "location"] as string[]).includes(key)) { data[key] = null; continue; }
      if (typeof body[key] !== "string" || body[key].length > (key === "title" ? 150 : key === "location" ? 200 : key === "coordinator" ? 150 : key === "imageUrl" ? 2048 : 10000) || (["title", "description", "neededItems", "location"] as string[]).includes(key) && !body[key].trim()) { response.status(400).json({ error: "Provide valid campaign details." }); return; }
      if (key === "imageUrl" && body[key] && !(/^https?:\/\//i.test(body[key]) || /^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(body[key]))) { response.status(400).json({ error: "Campaign image must be an HTTP(S) URL or a stored campaign upload." }); return; }
      data[key] = body[key].trim() || null;
    }
  }
  if (body.status !== undefined) {
    if (!["ACTIVE", "CLOSED"].includes(body.status)) { response.status(400).json({ error: "Campaign status must be ACTIVE or CLOSED." }); return; }
    data.status = body.status;
  }
  const hasSchedule = ["startDate", "startTime", "endDate", "endTime"].some((key) => body[key] !== undefined);
  if (hasSchedule) {
    const schedule = validateCampaignSchedule(body.startDate, body.startTime, body.endDate, body.endTime);
    if ("error" in schedule) { response.status(400).json({ error: schedule.error }); return; }
    data.startDate = schedule.start;
    data.endDate = schedule.end;
    data.deadline = schedule.end;
  }
  if (body.categoryIds !== undefined) {
    if (!Array.isArray(body.categoryIds) || !body.categoryIds.length || body.categoryIds.length > 30 || body.categoryIds.some((id: unknown) => typeof id !== "string" || !id.trim())) {
      response.status(400).json({ error: "Select at least one valid campaign category." }); return;
    }
    try {
      const ids = [...new Set(body.categoryIds as string[])];
      const categories = await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      if (categories.length !== ids.length) { response.status(400).json({ error: "One or more selected campaign categories are invalid." }); return; }
      const names = categories.map((category) => category.name);
      data.neededItems = names.join(", ");
      data.acceptedCategories = names.join(", ");
    } catch { response.status(500).json({ error: "Could not validate campaign categories." }); return; }
  }
  try {
    const current = await prisma.donationCampaign.findUnique({ where: { id: request.params.id }, select: { imageUrl: true } });
    if (!current) { response.status(404).json({ error: "Campaign not found." }); return; }
    const campaign = await prisma.donationCampaign.update({ where: { id: request.params.id }, data: data as never });
    if (current.imageUrl && Object.hasOwn(data, "imageUrl") && data.imageUrl !== current.imageUrl) await deleteStoredImage(current.imageUrl).catch(() => undefined);
    response.json({ campaign });
  } catch { response.status(404).json({ error: "Campaign not found." }); }
});

router.delete("/campaigns/:id", requireAuth, requireAdmin, async (request, response) => {
  try { const campaign = await prisma.donationCampaign.delete({ where: { id: request.params.id }, select: { imageUrl: true } }); if (campaign.imageUrl) await deleteStoredImage(campaign.imageUrl).catch(() => undefined); response.json({ message: "Campaign deleted." }); }
  catch { response.status(404).json({ error: "Campaign not found." }); }
});

router.post("/campaigns/:id/image", requireAuth, requireAdmin, uploadImage, async (request, response) => {
  const file = request.file;
  if (!file) { response.status(400).json({ error: "Choose a campaign image to upload." }); return; }
  const detected = detectImage(file.buffer);
  if (!detected) { response.status(415).json({ error: "Upload a valid JPEG, PNG, or WebP image." }); return; }
  try {
    const current = await prisma.donationCampaign.findUnique({ where: { id: request.params.id }, select: { imageUrl: true } });
    if (!current) { response.status(404).json({ error: "Campaign not found." }); return; }
    const imageUrl = await storeImage(file.buffer, detected.mimeType, "campaigns");
    try {
      const campaign = await prisma.donationCampaign.update({ where: { id: request.params.id }, data: { imageUrl } });
      if (current.imageUrl) await deleteStoredImage(current.imageUrl).catch(() => undefined);
      response.json({ campaign });
    } catch (error) {
      await deleteStoredImage(imageUrl).catch(() => undefined);
      throw error;
    }
  } catch { response.status(500).json({ error: "Could not save the campaign image." }); }
});

router.get("/campaigns/:id/donations", requireAuth, requireAdmin, async (request, response) => {
  try {
    const donations = await prisma.campaignDonation.findMany({ where: { campaignId: request.params.id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { submittedAt: "desc" } });
    response.json({ donations });
  } catch { response.status(500).json({ error: "Could not load campaign donations." }); }
});

router.patch("/campaign-donations/:id", requireAuth, requireAdmin, async (request, response) => {
  const status = request.body?.status;
  if (!["SUBMITTED", "RECEIVED", "COMPLETED", "CANCELLED"].includes(status)) { response.status(400).json({ error: "Choose a valid campaign donation status." }); return; }
  try {
    const donation = await prisma.campaignDonation.update({ where: { id: request.params.id }, data: { status }, include: { campaign: { select: { title: true } } } });
    await prisma.notification.create({ data: { recipientId: donation.userId, exchangeRequestId: null, type: "CAMPAIGN_DONATION_STATUS", message: `Your ${donation.campaign.title} donation status is now ${status.toLowerCase()}.` } });
    response.json({ donation });
  } catch { response.status(404).json({ error: "Campaign donation not found." }); }
});

router.get("/users", async (request, response) => {
  const { page, limit } = pageParameters(request);
  const q = typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (!validPage(page, limit)) {
    response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." });
    return;
  }
  const where = q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {};
  try {
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true, _count: { select: { items: true, donations: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    response.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    reportError(response);
  }
});

router.get("/items", async (request, response) => {
  const { page, limit } = pageParameters(request);
  const q = typeof request.query.q === "string" ? request.query.q.trim() : "";
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  if (!validPage(page, limit)) {
    response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." });
    return;
  }
  if (status && !itemStatuses.includes(status as never)) {
    response.status(400).json({ error: "Choose a valid item status." });
    return;
  }
  const where = {
    ...(status ? { status: status as (typeof ItemStatus)[keyof typeof ItemStatus] } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}),
  };
  try {
    const [items, total] = await prisma.$transaction([
      prisma.item.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } }, owner: { select: { id: true, name: true, email: true } }, images: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.item.count({ where }),
    ]);
    response.json({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    reportError(response);
  }
});

router.get("/requests", async (request, response) => {
  const { page, limit } = pageParameters(request);
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  if (!validPage(page, limit)) {
    response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." });
    return;
  }
  if (status && !Object.values(RequestStatus).includes(status as never)) {
    response.status(400).json({ error: "Choose a valid request status." });
    return;
  }
  const where = status ? { status: status as (typeof RequestStatus)[keyof typeof RequestStatus] } : {};
  try {
    const [requests, total] = await prisma.$transaction([
      prisma.exchangeRequest.findMany({
        where,
        include: {
          item: { select: { id: true, title: true, status: true } },
          requester: { select: { id: true, name: true, email: true } },
          owner: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.exchangeRequest.count({ where }),
    ]);
    response.json({ requests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    reportError(response);
  }
});

router.get("/metrics", async (request, response) => {
  const { page, limit } = pageParameters(request);
  const eventType = typeof request.query.eventType === "string" ? request.query.eventType : undefined;
  if (!validPage(page, limit)) {
    response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." });
    return;
  }
  if (eventType && !eventTypes.includes(eventType as never)) {
    response.status(400).json({ error: "Choose a valid sustainability event type." });
    return;
  }
  const where = eventType ? { eventType: eventType as (typeof SustainabilityEventType)[keyof typeof SustainabilityEventType] } : {};
  try {
    const [metrics, total] = await prisma.$transaction([
      prisma.sustainabilityMetric.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } }, item: { select: { id: true, title: true, category: { select: { name: true } }, sustainabilityCalculation: { select: { netAvoidedCO2e: true, confidenceLevel: true } } } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sustainabilityMetric.count({ where }),
    ]);
    response.json({ metrics: metrics.map((metric) => ({
      ...metric,
      estimatedCo2eAvoidedKg: metric.item.sustainabilityCalculation?.netAvoidedCO2e ?? null,
      calculationConfidence: metric.item.sustainabilityCalculation?.confidenceLevel ?? null,
    })), label: ESTIMATE_LABEL, methodology: ESTIMATE_METHODOLOGY, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    reportError(response);
  }
});

router.delete("/items/:id", async (request, response) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: request.params.id }, select: { id: true, status: true } });
      if (!item) return { status: 404, error: "Item not found." };
      if (item.status === ItemStatus.EXCHANGED || item.status === ItemStatus.SOLD || item.status === ItemStatus.DONATED) {
        return { status: 409, error: "Completed items cannot be removed." };
      }
      const acceptedCount = await tx.exchangeRequest.count({ where: { itemId: item.id, status: RequestStatus.ACCEPTED } });
      if (acceptedCount) return { status: 409, error: "Items with an accepted request cannot be removed." };

      const pending = await tx.exchangeRequest.findMany({
        where: { itemId: item.id, status: RequestStatus.PENDING },
        select: { id: true, requesterId: true },
      });
      await tx.item.update({ where: { id: item.id }, data: { status: ItemStatus.REMOVED } });
      if (pending.length) {
        await tx.exchangeRequest.updateMany({ where: { itemId: item.id, status: RequestStatus.PENDING }, data: { status: RequestStatus.REJECTED } });
        await tx.notification.createMany({
          data: pending.map((entry) => ({
            recipientId: entry.requesterId,
            actorId: null,
            exchangeRequestId: entry.id,
            type: "ITEM_REMOVED_BY_ADMIN",
            message: "A listing you requested was removed by an administrator.",
          })),
        });
      }
      return { status: 200, itemId: item.id };
    });
    if ("error" in result) {
      response.status(result.status).json({ error: result.error });
      return;
    }
    response.json({ message: "Item removed.", itemId: result.itemId });
  } catch {
    reportError(response);
  }
});

export default router;
