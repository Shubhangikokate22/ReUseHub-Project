import { Router } from "express";
import { ItemStatus, RequestStatus, SustainabilityEventType } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.ts";
import { ESTIMATE_LABEL, ESTIMATE_METHODOLOGY, getDisplacementFactor, summarizeCampusMetrics } from "../services/sustainability.ts";

const router = Router();

function numberOrZero(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

router.get("/methodology", (_request, response) => {
  response.json({
    label: ESTIMATE_LABEL,
    unit: "kg CO2e",
    formula: "Estimated avoided emissions = baseline scenario emissions - reuse scenario emissions.",
    baseline: "Reference lifecycle factor multiplied by the configurable displacement assumption.",
    reuseScenario: "Currently zero; refurbishment emissions are omitted because they are not collected.",
    transport: "Currently zero and omitted; distance and transport mode are not collected, so zero is not a measured value.",
    displacementFactor: getDisplacementFactor(),
    assumptions: ESTIMATE_METHODOLOGY,
    disclaimer: "All environmental values are estimates, not measured or certified savings and not a complete product LCA.",
  });
});

router.get("/factors", async (_request, response) => {
  try {
    const factors = await prisma.emissionFactor.findMany({ orderBy: [{ category: "asc" }, { subcategory: "asc" }] });
    response.json({ factors });
  } catch {
    response.status(500).json({ error: "Could not load reference factors." });
  }
});

router.get("/me", requireAuth, async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth?.userId;
  try {
    const [metrics, completedExchanges, itemsDonated, itemsSold] = await prisma.$transaction([
      prisma.sustainabilityMetric.findMany({
        where: { userId },
        select: { itemId: true, eventType: true, estimatedWasteAvoidedKg: true },
      }),
      prisma.exchangeRequest.count({
        where: {
          status: RequestStatus.COMPLETED,
          item: { is: { exchangeType: "EXCHANGE" } },
          OR: [{ requesterId: userId }, { ownerId: userId }],
        },
      }),
      prisma.donation.count({ where: { donorId: userId } }),
      prisma.item.count({ where: { ownerId: userId, status: ItemStatus.SOLD } }),
    ]);

    const items = [...new Set(metrics.map((metric) => metric.itemId))];
    const calculations = items.length ? await prisma.sustainabilityCalculation.findMany({
      where: { itemId: { in: items } },
      select: { itemId: true, netAvoidedCO2e: true, confidenceLevel: true },
    }) : [];
    const totalWaste = metrics.reduce((sum, metric) => sum + numberOrZero(metric.estimatedWasteAvoidedKg), 0);
    const totalCo2e = calculations.reduce((sum, calculation) => sum + numberOrZero(calculation.netAvoidedCO2e), 0);
    const measuredFactors = calculations.filter((calculation) => calculation.netAvoidedCO2e !== null).length;
    const confidenceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    const confidenceLevel = calculations.length
      ? calculations.reduce((worst, calculation) => confidenceOrder[calculation.confidenceLevel] > confidenceOrder[worst] ? calculation.confidenceLevel : worst, "HIGH" as keyof typeof confidenceOrder)
      : null;

    response.json({
      impact: {
        label: ESTIMATE_LABEL,
        estimatedWasteAvoidedKg: Math.round(totalWaste * 1000) / 1000,
        estimatedCo2eAvoidedKg: Math.round(totalCo2e * 1000) / 1000,
        co2eCalculationsAvailable: measuredFactors,
        exchangesCompleted: completedExchanges,
        itemsReused: completedExchanges,
        itemsDonated,
        itemsSold,
        recordedContributions: metrics.length,
        confidenceLevel,
        methodology: ESTIMATE_METHODOLOGY,
      },
    });
  } catch {
    response.status(500).json({ error: "Could not load sustainability impact." });
  }
});

router.get("/campus", async (_request, response) => {
  try {
    const [metrics, exchangesCompleted, itemsDonated, itemsSold, calculations] = await prisma.$transaction([
      prisma.sustainabilityMetric.findMany({
        select: { itemId: true, eventType: true, estimatedWasteAvoidedKg: true, estimatedCo2eAvoidedKg: true },
      }),
      prisma.exchangeRequest.count({ where: { status: RequestStatus.COMPLETED, item: { is: { exchangeType: "EXCHANGE" } } } }),
      prisma.donation.count(),
      prisma.item.count({ where: { status: ItemStatus.SOLD } }),
      prisma.sustainabilityCalculation.findMany({ select: { itemId: true, netAvoidedCO2e: true } }),
    ]);

    const totals = summarizeCampusMetrics(metrics);
    const seen = new Set<string>();
    const estimatedCo2eAvoidedKg = calculations.reduce((total, calculation) => {
      if (seen.has(calculation.itemId)) return total;
      seen.add(calculation.itemId);
      return total + numberOrZero(calculation.netAvoidedCO2e);
    }, 0);

    response.json({
      impact: {
        label: ESTIMATE_LABEL,
        estimatedWasteAvoidedKg: totals.estimatedWasteAvoidedKg,
        estimatedCo2eAvoidedKg: Math.round(estimatedCo2eAvoidedKg * 1000) / 1000,
        co2eCalculationsAvailable: calculations.filter((calculation) => calculation.netAvoidedCO2e !== null).length,
        exchangesCompleted,
        itemsDonated,
        itemsSold,
        reusedItems: exchangesCompleted + itemsDonated + itemsSold,
        methodology: ESTIMATE_METHODOLOGY,
      },
    });
  } catch {
    response.status(500).json({ error: "Could not load campus sustainability impact." });
  }
});

router.get("/leaderboard", async (_request, response) => {
  try {
    const ranked = await prisma.sustainabilityMetric.groupBy({
      by: ["userId", "eventType"],
      _count: { _all: true },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(ranked.map((entry) => entry.userId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((user) => [user.id, user.name]));
    const scores = new Map<string, number>();
    for (const entry of ranked) {
      const points = entry.eventType === SustainabilityEventType.DONATION_COMPLETED
        ? 120
        : entry.eventType === SustainabilityEventType.SALE_COMPLETED
          ? 80
          : 100;
      scores.set(entry.userId, (scores.get(entry.userId) ?? 0) + entry._count._all * points);
    }
    const leaderboard = [...scores.entries()]
      .map(([userId, points]) => ({ userId, name: names.get(userId) ?? "Campus member", points }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .slice(0, 20)
      .map((entry, index) => ({ rank: index + 1, ...entry }));
    response.json({ leaderboard, scoring: "Points are based only on completed exchanges, donations, and sales. Listings do not earn points." });
  } catch {
    response.status(500).json({ error: "Could not load the campus leaderboard." });
  }
});

router.get("/items/:itemId/calculation", requireAuth, async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth?.userId;
  try {
    const participation = await prisma.sustainabilityMetric.findFirst({ where: { itemId: request.params.itemId, userId }, select: { id: true } });
    if (!participation) {
      response.status(404).json({ error: "Calculation not found for this completed transaction." });
      return;
    }
    const calculation = await prisma.sustainabilityCalculation.findUnique({
      where: { itemId: request.params.itemId },
      include: { emissionFactor: true },
    });
    if (!calculation) {
      response.status(404).json({ error: "No calculation is recorded for this item." });
      return;
    }
    response.json({ calculation, formula: "Estimated net avoided emissions = (reference factor × displacement assumption) − reuse-scenario emissions − transport emissions." });
  } catch {
    response.status(500).json({ error: "Could not load calculation details." });
  }
});

export default router;
