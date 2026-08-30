import { PrismaClient } from "@prisma/client";
import { seedTruckSpecification } from "./seedTruckSpecification.js";

const prisma = new PrismaClient();

async function main() {
  await seedTruckSpecification();
}

main()
  .catch((e) => {
    console.error("❌ Seeding process critically failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
