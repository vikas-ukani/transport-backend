import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const truckDataset = [
  {
    ton_limit: 1,
    length_range: "7ft - 12ft",
    lengths: [
      { ft: 7, heights: [5.0, 6, 7] },
      { ft: 8, heights: [6.0, 6.5, 7] },
      { ft: 10, heights: [6.0, 6.5, 7] },
      { ft: 12, heights: [6, 7, 8] },
    ],
  },
  {
    ton_limit: 4,
    length_range: "14ft - 18ft",
    lengths: [
      { ft: 14, heights: [6, 7, 8] },
      { ft: 16, heights: [6, 7, 8] },
      { ft: 17, heights: [7, 8, 9] },
      { ft: 18, heights: [7, 8, 9] },
    ],
  },
  {
    ton_limit: 8,
    length_range: "19ft - 24ft",
    lengths: [
      { ft: 19, heights: [8, 9, 10] },
      { ft: 20, heights: [8, 9, 10] },
      { ft: 22, heights: [8, 9, 10] },
      { ft: 24, heights: [8, 9, 10] },
    ],
  },
  {
    ton_limit: 15,
    length_range: "25ft - 28ft",
    lengths: [
      { ft: 25, heights: [9, 10, 12] },
      { ft: 26, heights: [9, 10, 12] },
      { ft: 27, heights: [9, 10, 12] },
      { ft: 28, heights: [9, 10, 12] },
    ],
  },
  {
    ton_limit: 25,
    length_range: "30ft - 40ft",
    lengths: [
      { ft: 30, heights: [12, 14, 16] },
      { ft: 32, heights: [12, 14, 16] },
      { ft: 28, heights: [12, 14, 16] },
      { ft: 40, heights: [12, 14, 16] },
    ],
  },
];

export async function seedTruckSpecification() {
  console.log("🔄 Clearing existing truck specifications lookup tables...");
  await prisma.truckSpecification.deleteMany({});
  console.log("🌱 Starting database seeding process...");

  for (const item of truckDataset) {
    await prisma.truckSpecification.create({
      data: {
        tonLimit: item.ton_limit,
        lengthRangeLabel: item.length_range,
        lengths: {
          create: item.lengths.map((len) => ({
            feet: len.ft,
            heights: {
              create: len.heights.map((h) => ({
                heightFt: h,
              })),
            },
          })),
        },
      },
    });
  }
  console.log(
    "✅ Success! 40 structural truck profiles dynamically provisioned.",
  );
}
