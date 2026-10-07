import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { ExchangeType, ItemCondition, ItemStatus, RequestStatus } from "../../generated/prisma/enums.ts";
import { prisma } from "../database.ts";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.ts";
import { calculateItemSustainabilityScore } from "../services/sustainability.ts";

const router = Router();
const uploadDirectory = path.resolve(process.cwd(), "uploads");
const parseSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("image");
const conditions = Object.values(ItemCondition);
const exchangeTypes = Object.values(ExchangeType);
const itemInclude = {
  category: { select: { id: true, name: true, slug: true } },
  owner: { select: { id: true, name: true } },
  images: { orderBy: { createdAt: "asc" as const } },
};

function withSustainabilityScore<T extends { category: { slug: string }; condition: string; exchangeType: string }>(item: T) {
  return { ...item, sustainabilityScore: calculateItemSustainabilityScore(item) };
}

function userId(request: AuthenticatedRequest): string | undefined {
  return request.auth?.userId;
}

export function uploadImage(request: Parameters<typeof parseSingleImage>[0], response: Parameters<typeof parseSingleImage>[1], next: Parameters<typeof parseSingleImage>[2]) {
  parseSingleImage(request, response, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ error: "Image must be 5 MB or smaller." });
      return;
    }
    if (error) {
      response.status(400).json({ error: "Could not read the uploaded image." });
      return;
    }
    if (request.file && !["image/jpeg", "image/png", "image/webp"].includes(request.file.mimetype)) {
      response.status(415).json({ error: "Upload a JPEG, PNG, or WebP image." });
      return;
    }
    next();
  });
}

export function detectImage(buffer: Buffer): { extension: string; mimeType: string } | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { extension: "webp", mimeType: "image/webp" };
  }
  return undefined;
}

export function imageFilename(url: string): string | undefined {
  const match = /^\/uploads\/([a-f0-9-]+\.(?:jpg|png|webp))$/i.exec(url);
  return match?.[1];
}

function parseWeight(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1000) return NaN;
  return value;
}

function parsePrice(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return NaN;
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) return NaN;
  return Math.round(price * 100) / 100;
}

function validateCreate(body: Record<string, unknown>) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const condition = body.condition;
  const exchangeType = body.exchangeType ?? ExchangeType.EXCHANGE;
  const categoryId = body.categoryId;
  const weight = parseWeight(body.estimatedWeightKg);
  const price = parsePrice(body.price);
  const priceNegotiable = body.priceNegotiable ?? false;
  const exchangePreferredCategories = body.exchangePreferredCategories === undefined ? [] : body.exchangePreferredCategories;

  if (title.length < 2 || title.length > 150) return { error: "Title must be between 2 and 150 characters." };
  if (!description || description.length > 10000) return { error: "Description is required and must be at most 10,000 characters." };
  if (typeof condition !== "string" || !conditions.includes(condition as never)) return { error: "Choose a valid item condition." };
  if (typeof exchangeType !== "string" || !exchangeTypes.includes(exchangeType as never)) return { error: "Choose a valid exchange type." };
  if (typeof categoryId !== "string" || !categoryId.trim()) return { error: "A category is required." };
  if (typeof weight === "number" && !Number.isFinite(weight)) return { error: "Estimated weight must be between 0 and 1,000 kg." };
  if (typeof price === "number" && !Number.isFinite(price)) return { error: "Sale price must be greater than 0 and at most 1,000,000." };
  if (typeof priceNegotiable !== "boolean") return { error: "Choose whether the sale price is negotiable." };
  if (!Array.isArray(exchangePreferredCategories) || exchangePreferredCategories.length > 20 || exchangePreferredCategories.some((entry) => typeof entry !== "string" || entry.length > 191)) return { error: "Choose valid preferred exchange categories." };
  if (exchangeType === ExchangeType.SALE && (typeof price !== "number" || price <= 0)) return { error: "A sale listing needs a price greater than 0." };
  if (exchangeType !== ExchangeType.SALE && (price !== undefined && price !== null || priceNegotiable)) return { error: "Price details are only available for sale listings." };

  return {
    data: {
      title,
      description,
      condition: condition as (typeof ItemCondition)[keyof typeof ItemCondition],
      exchangeType: exchangeType as (typeof ExchangeType)[keyof typeof ExchangeType],
      exchangePreferredCategories: exchangeType === ExchangeType.EXCHANGE ? exchangePreferredCategories : [],
      categoryId: categoryId.trim(),
      ...(weight !== undefined ? { estimatedWeightKg: weight } : {}),
      ...(exchangeType === ExchangeType.SALE ? { price, priceNegotiable } : { price: null, priceNegotiable: false }),
    },
  };
}

router.get("/mine", requireAuth, async (request, response) => {
  const ownerId = userId(request as AuthenticatedRequest);
  try {
    const items = await prisma.item.findMany({
      where: { ownerId },
      include: itemInclude,
      orderBy: { createdAt: "desc" },
    });
    response.json({ items });
  } catch {
    response.status(500).json({ error: "Could not load your items." });
  }
});

router.get("/", async (request, response) => {
  const page = Number(request.query.page ?? 1);
  const limit = Number(request.query.limit ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    response.status(400).json({ error: "Page must be positive and limit must be between 1 and 50." });
    return;
  }

  const q = typeof request.query.q === "string" ? request.query.q.trim() : "";
  const categoryId = typeof request.query.categoryId === "string" ? request.query.categoryId : undefined;
  const condition = typeof request.query.condition === "string" ? request.query.condition : undefined;
  const exchangeType = typeof request.query.exchangeType === "string" ? request.query.exchangeType : undefined;
  const minPrice = request.query.minPrice === undefined ? undefined : Number(request.query.minPrice);
  const maxPrice = request.query.maxPrice === undefined ? undefined : Number(request.query.maxPrice);
  const negotiable = request.query.negotiable === "true" ? true : request.query.negotiable === "false" ? false : undefined;
  const sort = typeof request.query.sort === "string" ? request.query.sort : "newest";
  if (condition && !conditions.includes(condition as never)) {
    response.status(400).json({ error: "Choose a valid item condition." });
    return;
  }
  if (exchangeType && !exchangeTypes.includes(exchangeType as never)) {
    response.status(400).json({ error: "Choose a valid exchange type." });
    return;
  }
  if ((minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) || (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) || (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)) {
    response.status(400).json({ error: "Provide a valid non-negative price range." });
    return;
  }
  if (request.query.negotiable !== undefined && negotiable === undefined) {
    response.status(400).json({ error: "Negotiable must be true or false." });
    return;
  }
  if (! ["newest", "oldest", "lowestPrice", "highestPrice"].includes(sort)) {
    response.status(400).json({ error: "Sort must be newest, oldest, lowestPrice, or highestPrice." });
    return;
  }
  if ((minPrice !== undefined || maxPrice !== undefined || negotiable !== undefined || sort === "lowestPrice" || sort === "highestPrice") && exchangeType && exchangeType !== ExchangeType.SALE) {
    response.status(400).json({ error: "Price filters can only be used for sale listings." });
    return;
  }

  const where = {
    status: { in: [ItemStatus.AVAILABLE, ItemStatus.REQUESTED] },
    activeExchangeRequestId: null,
    requests: { none: { status: RequestStatus.ACCEPTED } },
    ...(categoryId ? { categoryId } : {}),
    ...(condition ? { condition: condition as (typeof ItemCondition)[keyof typeof ItemCondition] } : {}),
    ...(exchangeType ? { exchangeType: exchangeType as (typeof ExchangeType)[keyof typeof ExchangeType] } : minPrice !== undefined || maxPrice !== undefined || negotiable !== undefined || sort === "lowestPrice" || sort === "highestPrice" ? { exchangeType: ExchangeType.SALE } : {}),
    ...((minPrice !== undefined || maxPrice !== undefined) ? { price: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) } } : {}),
    ...(negotiable !== undefined ? { priceNegotiable: negotiable } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.item.findMany({ where, include: itemInclude, orderBy: sort === "oldest" ? { createdAt: "asc" } : sort === "lowestPrice" ? { price: "asc" } : sort === "highestPrice" ? { price: "desc" } : { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.item.count({ where }),
    ]);
    response.json({ items: items.map(withSustainabilityScore), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    response.status(500).json({ error: "Could not search items." });
  }
});

router.get("/recommended", requireAuth, async (request, response) => {
  const ownerId = userId(request as AuthenticatedRequest)!;
  try {
    const [wishlist, completed] = await prisma.$transaction([
      prisma.wishlist.findMany({ where: { userId: ownerId }, select: { item: { select: { categoryId: true } } }, take: 30 }),
      prisma.exchangeRequest.findMany({
        where: { status: RequestStatus.COMPLETED, OR: [{ requesterId: ownerId }, { ownerId }] },
        select: { item: { select: { categoryId: true } } }, take: 30,
      }),
    ]);
    const preferred = [...new Set([...wishlist.map((entry) => entry.item.categoryId), ...completed.map((entry) => entry.item.categoryId)])];
    const items = await prisma.item.findMany({
      where: { status: { in: [ItemStatus.AVAILABLE, ItemStatus.REQUESTED] }, activeExchangeRequestId: null, requests: { none: { status: RequestStatus.ACCEPTED } }, ownerId: { not: ownerId }, ...(preferred.length ? { categoryId: { in: preferred } } : {}) },
      include: itemInclude,
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    response.json({
      recommendations: items.map((rawItem) => {
        const item = withSustainabilityScore(rawItem);
        return { item, reason: preferred.includes(rawItem.categoryId) ? "A category you have saved or reused" : "Recently listed on campus" };
      }),
      method: "Rule-based recommendations from saved categories and completed transactions; no AI or machine learning is used.",
    });
  } catch {
    response.status(500).json({ error: "Could not load recommendations." });
  }
});

router.post("/", requireAuth, async (request, response) => {
  const ownerId = userId(request as AuthenticatedRequest);
  const validated = validateCreate(request.body ?? {});
  if ("error" in validated) {
    response.status(400).json({ error: validated.error });
    return;
  }

  try {
    const category = await prisma.category.findUnique({ where: { id: validated.data.categoryId }, select: { id: true } });
    if (!category) {
      response.status(400).json({ error: "Choose an existing category." });
      return;
    }
    const preferenceIds = validated.data.exchangePreferredCategories as string[];
    if (preferenceIds.length && await prisma.category.count({ where: { id: { in: preferenceIds } } }) !== new Set(preferenceIds).size) {
      response.status(400).json({ error: "Choose existing preferred exchange categories." }); return;
    }
    const item = await prisma.item.create({
      data: { ...validated.data, ownerId: ownerId!, status: ItemStatus.AVAILABLE },
      include: itemInclude,
    });
    await prisma.itemLifecycleEvent.create({ data: { itemId: item.id, actorId: ownerId!, event: "LISTED" } });
    response.status(201).json({ item });
  } catch {
    response.status(500).json({ error: "Could not create the item." });
  }
});

router.post("/:itemId/images", requireAuth, uploadImage, async (request, response) => {
  const ownerId = userId(request as AuthenticatedRequest);
  const itemId = request.params.itemId;
  const file = request.file;
  if (!file) {
    response.status(400).json({ error: "Choose an image to upload." });
    return;
  }

  const detected = detectImage(file.buffer);
  if (!detected || detected.mimeType !== file.mimetype) {
    response.status(415).json({ error: "The image contents must match a JPEG, PNG, or WebP file." });
    return;
  }

  try {
    const item = await prisma.item.findFirst({ where: { id: itemId, ownerId, status: ItemStatus.AVAILABLE }, select: { id: true } });
    if (!item) {
      response.status(404).json({ error: "Available item not found for this owner." });
      return;
    }
    const imageCount = await prisma.itemImage.count({ where: { itemId } });
    if (imageCount >= 5) {
      response.status(409).json({ error: "An item can have up to five photos." });
      return;
    }

    await mkdir(uploadDirectory, { recursive: true });
    const filename = `${randomUUID()}.${detected.extension}`;
    const url = `/uploads/${filename}`;
    await writeFile(path.join(uploadDirectory, filename), file.buffer, { flag: "wx" });
    try {
      const image = await prisma.itemImage.create({
        data: { itemId, url, storageSizeBytes: file.size, mimeType: detected.mimeType },
      });
      response.status(201).json({ image });
    } catch (error) {
      await unlink(path.join(uploadDirectory, filename)).catch(() => undefined);
      throw error;
    }
  } catch {
    response.status(500).json({ error: "Could not save the item image." });
  }
});

router.delete("/:itemId/images/:imageId", requireAuth, async (request, response) => {
  const ownerId = userId(request as AuthenticatedRequest);
  try {
    const item = await prisma.item.findFirst({
      where: { id: request.params.itemId, ownerId, status: ItemStatus.AVAILABLE },
      select: { id: true },
    });
    if (!item) {
      response.status(404).json({ error: "Available item not found for this owner." });
      return;
    }

    const image = await prisma.itemImage.findFirst({ where: { id: request.params.imageId, itemId: item.id } });
    if (!image) {
      response.status(404).json({ error: "Item image not found." });
      return;
    }

    await prisma.itemImage.delete({ where: { id: image.id } });
    const filename = imageFilename(image.url);
    if (filename) await unlink(path.join(uploadDirectory, filename)).catch(() => undefined);
    response.json({ message: "Image removed." });
  } catch {
    response.status(500).json({ error: "Could not remove the item image." });
  }
});

router.get("/:id/lifecycle", async (request, response) => {
  try {
    const item = await prisma.item.findUnique({ where: { id: request.params.id }, select: { id: true, status: true } });
    if (!item || item.status === ItemStatus.REMOVED) { response.status(404).json({ error: "Item not found." }); return; }
    const events = await prisma.itemLifecycleEvent.findMany({ where: { itemId: item.id }, select: { id: true, event: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } });
    response.json({ events });
  } catch { response.status(500).json({ error: "Could not load item history." }); }
});

router.get("/:id", async (request, response) => {
  try {
    const item = await prisma.item.findFirst({ where: { id: request.params.id, OR: [{ status: ItemStatus.AVAILABLE }, { status: ItemStatus.REQUESTED }] }, include: itemInclude });
    if (!item) {
      response.status(404).json({ error: "Item not found." });
      return;
    }
    response.json({ item: withSustainabilityScore(item) });
  } catch {
    response.status(500).json({ error: "Could not load the item." });
  }
});

router.put("/:id", requireAuth, async (request, response) => {
  const ownerId = userId(request as AuthenticatedRequest);
  const body = request.body ?? {};
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length < 2 || body.title.trim().length > 150) {
      response.status(400).json({ error: "Title must be between 2 and 150 characters." });
      return;
    }
    data.title = body.title.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || !body.description.trim() || body.description.trim().length > 10000) {
      response.status(400).json({ error: "Description is required and must be at most 10,000 characters." });
      return;
    }
    data.description = body.description.trim();
  }
  if (body.condition !== undefined) {
    if (typeof body.condition !== "string" || !conditions.includes(body.condition as never)) {
      response.status(400).json({ error: "Choose a valid item condition." });
      return;
    }
    data.condition = body.condition;
  }
  if (body.exchangeType !== undefined) {
    if (typeof body.exchangeType !== "string" || !exchangeTypes.includes(body.exchangeType as never)) {
      response.status(400).json({ error: "Choose a valid exchange type." });
      return;
    }
    data.exchangeType = body.exchangeType;
    if (body.exchangeType !== ExchangeType.EXCHANGE) data.exchangePreferredCategories = [];
    if (body.exchangeType !== ExchangeType.SALE) {
      data.price = null;
      data.priceNegotiable = false;
    }
  }
  if (body.price !== undefined) {
    const price = parsePrice(body.price);
    if (typeof price === "number" && !Number.isFinite(price)) {
      response.status(400).json({ error: "Sale price must be greater than 0 and at most 1,000,000." });
      return;
    }
    data.price = price;
  }
  if (body.priceNegotiable !== undefined) {
    if (typeof body.priceNegotiable !== "boolean") {
      response.status(400).json({ error: "Choose whether the sale price is negotiable." });
      return;
    }
    data.priceNegotiable = body.priceNegotiable;
  }
  if (body.categoryId !== undefined) {
    if (typeof body.categoryId !== "string" || !(await prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } }))) {
      response.status(400).json({ error: "Choose an existing category." });
      return;
    }
    data.categoryId = body.categoryId;
  }
  if (body.estimatedWeightKg !== undefined) {
    const weight = parseWeight(body.estimatedWeightKg);
    if (typeof weight === "number" && !Number.isFinite(weight)) {
      response.status(400).json({ error: "Estimated weight must be between 0 and 1,000 kg." });
      return;
    }
    data.estimatedWeightKg = weight;
  }
  if (body.exchangePreferredCategories !== undefined) {
    if (!Array.isArray(body.exchangePreferredCategories) || body.exchangePreferredCategories.length > 20 || body.exchangePreferredCategories.some((entry: unknown) => typeof entry !== "string" || entry.length > 191)) {
      response.status(400).json({ error: "Choose valid preferred exchange categories." }); return;
    }
    data.exchangePreferredCategories = body.exchangePreferredCategories;
    if (body.exchangePreferredCategories.length && await prisma.category.count({ where: { id: { in: body.exchangePreferredCategories } } }) !== new Set(body.exchangePreferredCategories).size) {
      response.status(400).json({ error: "Choose existing preferred exchange categories." }); return;
    }
  }
  if (Object.keys(data).length === 0) {
    response.status(400).json({ error: "Provide at least one field to update." });
    return;
  }

  try {
    const existing = await prisma.item.findFirst({
      where: { id: request.params.id, ownerId, status: ItemStatus.AVAILABLE, activeExchangeRequestId: null },
      select: { exchangeType: true, price: true, priceNegotiable: true },
    });
    if (!existing) {
      response.status(404).json({ error: "Available item not found for this owner." });
      return;
    }
    const finalType = (data.exchangeType as typeof existing.exchangeType | undefined) ?? existing.exchangeType;
    const finalPrice = Object.hasOwn(data, "price") ? data.price : existing.price;
    const finalNegotiable = (data.priceNegotiable as boolean | undefined) ?? existing.priceNegotiable;
    if (finalType === ExchangeType.SALE && (finalPrice === null || finalPrice === undefined)) {
      response.status(400).json({ error: "A sale listing needs a price greater than 0." });
      return;
    }
    if (finalType !== ExchangeType.SALE && (finalPrice !== null || finalNegotiable)) {
      response.status(400).json({ error: "Price details are only available for sale listings." });
      return;
    }
    const updated = await prisma.item.updateMany({
      where: { id: request.params.id, ownerId, status: ItemStatus.AVAILABLE },
      data,
    });
    if (!updated.count) {
      response.status(404).json({ error: "Available item not found for this owner." });
      return;
    }
    const item = await prisma.item.findUnique({ where: { id: request.params.id }, include: itemInclude });
    response.json({ item });
  } catch {
    response.status(500).json({ error: "Could not update the item." });
  }
});

router.delete("/:id", requireAuth, async (request, response) => {
  const ownerId = userId(request as AuthenticatedRequest);
  try {
    const updated = await prisma.item.updateMany({
      where: { id: request.params.id, ownerId, status: ItemStatus.AVAILABLE },
      data: { status: ItemStatus.REMOVED },
    });
    if (!updated.count) {
      response.status(404).json({ error: "Available item not found for this owner." });
      return;
    }
    response.json({ message: "Item removed." });
  } catch {
    response.status(500).json({ error: "Could not remove the item." });
  }
});

export default router;
