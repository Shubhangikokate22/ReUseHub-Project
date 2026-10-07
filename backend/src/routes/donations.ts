import { Router } from "express";
import type { Response } from "express";
import { ExchangeType, ItemStatus, SustainabilityEventType } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.ts";
import { calculateLifecycleImpact, resolveEmissionFactor } from "../services/sustainability.ts";

const router = Router();

class DonationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function reportError(response: Response, error: unknown) {
  if (error instanceof DonationError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Could not process the donation." });
}

router.get("/mine", requireAuth, async (request, response) => {
  const donorId = (request as AuthenticatedRequest).auth?.userId;
  try {
    const donations = await prisma.donation.findMany({
      where: { donorId },
      include: { item: { include: { category: { select: { id: true, name: true, slug: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    response.json({ donations });
  } catch (error) {
    reportError(response, error);
  }
});

router.post("/:itemId/mark", requireAuth, async (request, response) => {
  const donorId = (request as AuthenticatedRequest).auth?.userId;
  try {
    const current = await prisma.item.findFirst({ where: { id: request.params.itemId, ownerId: donorId, status: ItemStatus.AVAILABLE }, select: { exchangeType: true } });
    const updated = await prisma.item.updateMany({
      where: { id: request.params.itemId, ownerId: donorId, status: ItemStatus.AVAILABLE },
      data: { exchangeType: ExchangeType.DONATION },
    });
    if (!updated.count) {
      response.status(404).json({ error: "Available item not found for this owner." });
      return;
    }
    if (current?.exchangeType !== ExchangeType.DONATION) await prisma.itemLifecycleEvent.create({ data: { itemId: request.params.itemId!, actorId: donorId!, event: "DONATION_MARKED" } });
    const item = await prisma.item.findUnique({
      where: { id: request.params.itemId },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    response.json({ item });
  } catch (error) {
    reportError(response, error);
  }
});

router.post("/:itemId/complete", requireAuth, async (request, response) => {
  const donorId = (request as AuthenticatedRequest).auth?.userId;
  try {
    const donation = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: request.params.itemId }, include: { category: { select: { slug: true } } } });
      if (!item || item.ownerId !== donorId) throw new DonationError(404, "Item not found for this owner.");
      if (item.exchangeType !== ExchangeType.DONATION) throw new DonationError(400, "Mark this item as donation-based first.");
      if (item.status !== ItemStatus.AVAILABLE) throw new DonationError(409, "Only available items can be donated.");

      const updated = await tx.item.updateMany({
        where: { id: item.id, ownerId: donorId, status: ItemStatus.AVAILABLE, exchangeType: ExchangeType.DONATION },
        data: { status: ItemStatus.DONATED },
      });
      if (!updated.count) throw new DonationError(409, "This item has already changed status.");
      const factorKey = resolveEmissionFactor(item.category.slug, item.title);
      const factor = factorKey ? await tx.emissionFactor.findUnique({ where: { category_subcategory: factorKey } }) : null;
      const impact = calculateLifecycleImpact({
        estimatedWeightKg: item.estimatedWeightKg === null ? null : Number(item.estimatedWeightKg),
        factorKgCO2e: factor?.factorKgCO2e == null ? null : Number(factor.factorKgCO2e),
        factorConfidence: factor?.confidenceLevel ?? null,
      });

      const donation = await tx.donation.create({
        data: { itemId: item.id, donorId: donorId! },
        include: { item: { include: { category: { select: { id: true, name: true, slug: true } } } } },
      });
      await tx.itemLifecycleEvent.create({ data: { itemId: item.id, actorId: donorId!, event: "DONATED" } });
      await tx.sustainabilityCalculation.create({
        data: {
          itemId: item.id,
          emissionFactorId: factor?.id,
          eventType: SustainabilityEventType.DONATION_COMPLETED,
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
      await tx.notification.create({
        data: {
          recipientId: donorId!,
          actorId: donorId!,
          type: "DONATION_COMPLETED",
          message: `Your donation of “${donation.item.title}” was recorded.`,
        },
      });
      await tx.sustainabilityMetric.create({
        data: {
          userId: donorId!,
          itemId: item.id,
          eventType: SustainabilityEventType.DONATION_COMPLETED,
          estimatedWasteAvoidedKg: impact.estimatedWasteAvoidedKg,
          estimatedCo2eAvoidedKg: impact.netAvoidedCO2e,
        },
      });
      return donation;
    });
    response.status(201).json({ donation });
  } catch (error) {
    reportError(response, error);
  }
});

export default router;
