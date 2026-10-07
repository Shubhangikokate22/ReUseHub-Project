import { Router } from "express";
import { SustainabilityEventType } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, requireAdmin, requireAuth } from "../middleware/auth.ts";
import { validateCampaignSchedule } from "../services/campaign-schedule.ts";

const router = Router();
const userId = (request: AuthenticatedRequest) => request.auth!.userId;
const metricValues = ["REUSE", "DONATION", "CO2E"] as const;

router.post("/reports", requireAuth, async (request, response) => {
  const reporterId = userId(request as AuthenticatedRequest);
  const { itemId, targetUserId, category, description } = request.body ?? {};
  const categories = ["INAPPROPRIATE_ITEM", "MISLEADING_LISTING", "SPAM", "SUSPICIOUS_USER", "PROHIBITED_ITEM", "OTHER"];
  if ((!itemId && !targetUserId) || (itemId && targetUserId) || !categories.includes(category) || typeof description !== "string" || !description.trim() || description.length > 1500 || targetUserId === reporterId) {
    response.status(400).json({ error: "Report one item or user with a supported reason and a short description." }); return;
  }
  try {
    if (itemId && !await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } })) { response.status(404).json({ error: "Item not found." }); return; }
    if (targetUserId && !await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } })) { response.status(404).json({ error: "User not found." }); return; }
    const report = await prisma.itemReport.create({ data: { reporterId, itemId: itemId ?? null, targetUserId: targetUserId ?? null, category, description: description.trim() } });
    response.status(201).json({ report });
  } catch { response.status(500).json({ error: "Could not submit this report." }); }
});

router.get("/campaigns", async (_request, response) => {
  try {
    const now = new Date();
    const campaigns = await prisma.donationCampaign.findMany({ where: { status: "ACTIVE", AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }, { OR: [{ deadline: null }, { deadline: { gte: now } }] }] }, include: { _count: { select: { contributions: true, donations: true } } }, orderBy: [{ startDate: "asc" }, { deadline: "asc" }, { createdAt: "desc" }] });
    response.json({ campaigns });
  } catch { response.status(500).json({ error: "Could not load donation campaigns." }); }
});

router.post("/campaigns", requireAuth, requireAdmin, async (request, response) => {
  const { title, description, categoryIds, location, instructions, coordinator, startDate, startTime, endDate, endTime, imageUrl } = request.body ?? {};
  if (typeof title !== "string" || title.trim().length < 3 || title.length > 150 || typeof description !== "string" || !description.trim() || typeof location !== "string" || !location.trim() || location.trim().length > 200 || (instructions != null && typeof instructions !== "string") || (coordinator != null && typeof coordinator !== "string") || (imageUrl != null && (typeof imageUrl !== "string" || imageUrl.length > 2048 || !/^https?:\/\//i.test(imageUrl)))) {
    response.status(400).json({ error: "Provide a campaign name, description, and official donation location." }); return;
  }
  if (!Array.isArray(categoryIds) || categoryIds.length === 0 || categoryIds.length > 30 || categoryIds.some((id: unknown) => typeof id !== "string" || !id.trim())) {
    response.status(400).json({ error: "Select at least one valid campaign category." }); return;
  }
  const schedule = validateCampaignSchedule(startDate, startTime, endDate, endTime);
  if ("error" in schedule) { response.status(400).json({ error: schedule.error }); return; }
  try {
    const uniqueIds = [...new Set(categoryIds as string[])];
    const categories = await prisma.category.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
    if (categories.length !== uniqueIds.length) { response.status(400).json({ error: "One or more selected campaign categories are invalid." }); return; }
    const categoryNames = categories.map((category) => category.name);
    const campaign = await prisma.donationCampaign.create({ data: { title: title.trim(), description: description.trim(), neededItems: categoryNames.join(", "), acceptedCategories: categoryNames.join(", "), location: location.trim(), instructions: typeof instructions === "string" ? instructions.trim() || null : null, coordinator: typeof coordinator === "string" ? coordinator.trim() || null : null, imageUrl: typeof imageUrl === "string" ? imageUrl.trim() || null : null, startDate: schedule.start, endDate: schedule.end, deadline: schedule.end } });
    response.status(201).json({ campaign });
  } catch { response.status(500).json({ error: "Could not create donation campaign." }); }
});

router.get("/campaign-donations/mine", requireAuth, async (request, response) => {
  const contributorId = userId(request as AuthenticatedRequest);
  try {
    const donations = await prisma.campaignDonation.findMany({ where: { userId: contributorId }, include: { campaign: { select: { id: true, title: true, location: true } } }, orderBy: { submittedAt: "desc" } });
    response.json({ donations });
  } catch { response.status(500).json({ error: "Could not load your campaign donations." }); }
});

router.post("/campaigns/:id/donations", requireAuth, async (request, response) => {
  const contributorId = userId(request as AuthenticatedRequest);
  const itemDetails = typeof request.body?.itemDetails === "string" ? request.body.itemDetails.trim() : "";
  const category = typeof request.body?.category === "string" ? request.body.category.trim() : "";
  if (!itemDetails || itemDetails.length > 500 || !category || category.length > 100) { response.status(400).json({ error: "Describe the item and choose its donation category." }); return; }
  try {
    const campaign = await prisma.donationCampaign.findUnique({ where: { id: request.params.id } });
    const now = new Date();
    if (!campaign || campaign.status !== "ACTIVE" || (campaign.startDate && campaign.startDate > now) || (campaign.endDate && campaign.endDate < now) || (campaign.deadline && campaign.deadline < now)) { response.status(409).json({ error: "This donation campaign is not currently accepting submissions." }); return; }
    const categories = campaign.acceptedCategories?.split(/[\n,;]/).map((entry) => entry.trim().toLowerCase()).filter(Boolean) ?? [];
    if (categories.length && !categories.includes(category.toLowerCase())) { response.status(400).json({ error: "This category is not accepted in the campaign." }); return; }
    const donation = await prisma.campaignDonation.create({ data: { campaignId: campaign.id, userId: contributorId, category, itemDetails } });
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length) await prisma.notification.createMany({ data: admins.map((admin) => ({ recipientId: admin.id, actorId: contributorId, type: "CAMPAIGN_DONATION_SUBMITTED", message: `A donation was submitted to ${campaign.title}.` })) });
    await prisma.notification.create({ data: { recipientId: contributorId, actorId: contributorId, type: "CAMPAIGN_DONATION_SUBMITTED", message: `Your donation was submitted to ${campaign.title}.` } });
    response.status(201).json({ donation });
  } catch { response.status(500).json({ error: "Could not submit this campaign donation." }); }
});

router.post("/campaigns/:id/contributions", requireAuth, async (request, response) => {
  const contributorId = userId(request as AuthenticatedRequest);
  const donationId = request.body?.donationId;
  if (typeof donationId !== "string") { response.status(400).json({ error: "Choose one of your completed donation handoffs." }); return; }
  try {
    const campaign = await prisma.donationCampaign.findUnique({ where: { id: request.params.id } });
    const now = new Date();
    if (!campaign || campaign.status !== "ACTIVE" || (campaign.startDate && campaign.startDate > now) || (campaign.endDate && campaign.endDate < now) || (campaign.deadline && campaign.deadline < now)) { response.status(409).json({ error: "This donation campaign is not currently active." }); return; }
    const donation = await prisma.donation.findUnique({ where: { id: donationId }, select: { itemId: true, donorId: true } });
    if (!donation || donation.donorId !== contributorId) { response.status(404).json({ error: "Completed donation not found for this user." }); return; }
    const contribution = await prisma.campaignContribution.create({ data: { campaignId: campaign.id, donationId, userId: contributorId } });
    response.status(201).json({ contribution });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") { response.status(409).json({ error: "This donation is already counted in the campaign." }); return; }
    response.status(500).json({ error: "Could not add this campaign contribution." });
  }
});

router.get("/goals", requireAuth, async (request, response) => {
  const uid = userId(request as AuthenticatedRequest);
  try {
    const [goals, metrics] = await prisma.$transaction([
      prisma.sustainabilityGoal.findMany({ where: { userId: uid }, orderBy: { createdAt: "desc" } }),
      prisma.sustainabilityMetric.findMany({ where: { userId: uid }, select: { eventType: true, estimatedCo2eAvoidedKg: true } }),
    ]);
    const result = goals.map((goal) => {
      const progress = goal.metric === "DONATION" ? metrics.filter((metric) => metric.eventType === SustainabilityEventType.DONATION_COMPLETED).length
        : goal.metric === "CO2E" ? metrics.reduce((sum, metric) => sum + Number(metric.estimatedCo2eAvoidedKg ?? 0), 0)
          : metrics.length;
      return { ...goal, progress: Math.round(progress * 1000) / 1000, completed: progress >= Number(goal.target) };
    });
    response.json({ goals: result });
  } catch { response.status(500).json({ error: "Could not load your sustainability goals." }); }
});

router.post("/goals", requireAuth, async (request, response) => {
  const uid = userId(request as AuthenticatedRequest);
  const { title, metric, target, deadline } = request.body ?? {};
  const parsedTarget = Number(target);
  const parsedDeadline = deadline ? new Date(deadline) : null;
  if (typeof title !== "string" || title.trim().length < 3 || title.length > 150 || !metricValues.includes(metric) || !Number.isFinite(parsedTarget) || parsedTarget <= 0 || parsedTarget > 100000 || (deadline && Number.isNaN(parsedDeadline?.getTime()))) {
    response.status(400).json({ error: "Provide a title, supported metric, positive target, and optional valid deadline." }); return;
  }
  try {
    const goal = await prisma.sustainabilityGoal.create({ data: { userId: uid, title: title.trim(), metric, target: parsedTarget, deadline: parsedDeadline } });
    response.status(201).json({ goal });
  } catch { response.status(500).json({ error: "Could not create this goal." }); }
});

router.delete("/goals/:id", requireAuth, async (request, response) => {
  const uid = userId(request as AuthenticatedRequest);
  try {
    const removed = await prisma.sustainabilityGoal.deleteMany({ where: { id: request.params.id, userId: uid } });
    if (!removed.count) { response.status(404).json({ error: "Goal not found." }); return; }
    response.json({ message: "Goal removed." });
  } catch { response.status(500).json({ error: "Could not remove this goal." }); }
});

router.get("/achievements", requireAuth, async (request, response) => {
  const uid = userId(request as AuthenticatedRequest);
  try {
    const [metrics, calculations, byUser] = await prisma.$transaction([
      prisma.sustainabilityMetric.findMany({ where: { userId: uid }, select: { eventType: true, itemId: true } }),
      prisma.sustainabilityCalculation.findMany({ where: { item: { is: { sustainabilityMetrics: { some: { userId: uid } } } } }, select: { netAvoidedCO2e: true } }),
      prisma.sustainabilityMetric.groupBy({ by: ["userId", "eventType"], _count: { _all: true } }),
    ]);
    const exchanges = metrics.length;
    const donations = metrics.filter((metric) => metric.eventType === SustainabilityEventType.DONATION_COMPLETED).length;
    const co2 = calculations.reduce((sum, row) => sum + Number(row.netAvoidedCO2e ?? 0), 0);
    const ranking = new Map<string, number>();
    for (const entry of byUser) {
      const points = entry.eventType === SustainabilityEventType.DONATION_COMPLETED ? 120 : entry.eventType === SustainabilityEventType.SALE_COMPLETED ? 80 : 100;
      ranking.set(entry.userId, (ranking.get(entry.userId) ?? 0) + points * entry._count._all);
    }
    const ordered = [...ranking.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const placement = ordered.findIndex(([entryUserId]) => entryUserId === uid);
    const achievements = [
      { id: "first-reuse", title: "First Reuse", description: "Complete a successful reuse handoff.", unlocked: exchanges >= 1 },
      { id: "reuse-champion", title: "Reuse Champion", description: "Complete five successful handoffs.", unlocked: exchanges >= 5 },
      { id: "generous-contributor", title: "Generous Contributor", description: "Complete five donations.", unlocked: donations >= 5 },
      { id: "green-contributor", title: "Green Contributor", description: "Reach 10 estimated kg CO2e net avoided.", unlocked: co2 >= 10 },
      { id: "campus-champion", title: "Campus Champion", description: "Reach the top three of the campus reuse leaderboard.", unlocked: placement >= 0 && placement < 3 },
    ];
    response.json({ achievements, activity: { completedHandoffs: exchanges, completedDonations: donations, estimatedNetAvoidedKgCO2e: Math.round(co2 * 1000) / 1000 }, note: "Unlocked from completed activity only. Impact thresholds use estimates." });
  } catch { response.status(500).json({ error: "Could not load achievements." }); }
});

export default router;
