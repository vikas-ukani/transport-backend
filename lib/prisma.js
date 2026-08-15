import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["info", "warn", "error"],
  errorFormat: "pretty", // Formats errors for easier reading; could be 'colorless' or 'minimal' if desired
});

export default prisma;
