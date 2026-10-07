import { Router } from "express";
import { prisma } from "../database.ts";

const router = Router();

router.get("/", async (_request, response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
    response.json({ categories });
  } catch {
    response.status(500).json({ error: "Could not load categories." });
  }
});

export default router;
