import "dotenv/config";
import { prisma } from "../src/database.ts";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Set ADMIN_EMAIL to the email address of an existing ReUseHub user.");
  process.exitCode = 1;
} else {
  try {
    const result = await prisma.user.updateMany({ where: { email }, data: { role: "ADMIN" } });
    if (!result.count) {
      console.error("No account exists for ADMIN_EMAIL. Register that user first, then run this command again.");
      process.exitCode = 1;
    } else {
      console.log(`Administrator role enabled for ${email}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
