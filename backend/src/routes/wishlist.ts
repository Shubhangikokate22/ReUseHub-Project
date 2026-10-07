import { Router } from "express";
import { ItemStatus } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.ts";

const router = Router();
const itemInclude = {
  category: { select: { id: true, name: true, slug: true } },
  owner: { select: { id: true, name: true } },
  images: { orderBy: { createdAt: "asc" as const } },
};

router.use(requireAuth);

router.get("/", async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth!.userId;
  try {
    const entries = await prisma.wishlist.findMany({
      where: { userId, item: { is: { status: ItemStatus.AVAILABLE } } },
      include: { item: { include: itemInclude } },
      orderBy: { createdAt: "desc" },
    });
    response.json({ items: entries.map((entry) => entry.item) });
  } catch {
    response.status(500).json({ error: "Could not load saved items." });
  }
});

router.post("/:itemId", async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth!.userId;
  const itemId = request.params.itemId;
  try {
    const item = await prisma.item.findFirst({ where: { id: itemId, status: ItemStatus.AVAILABLE }, select: { id: true } });
    if (!item) {
      response.status(404).json({ error: "Available item not found." });
      return;
    }
    const entry = await prisma.wishlist.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId },
      update: {},
      select: { id: true, itemId: true, createdAt: true },
    });
    response.status(201).json({ saved: true, entry });
  } catch {
    response.status(500).json({ error: "Could not save this item." });
  }
});

router.delete("/:itemId", async (request, response) => {
  const userId = (request as AuthenticatedRequest).auth!.userId;
  try {
    await prisma.wishlist.deleteMany({ where: { userId, itemId: request.params.itemId } });
    response.json({ saved: false });
  } catch {
    response.status(500).json({ error: "Could not remove this saved item." });
  }
});

export default router;
