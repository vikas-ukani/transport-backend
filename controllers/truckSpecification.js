import prisma from "../lib/prisma.js";

export const getTruckSpecifications = async (req, res) => {
  try {
    // Fetch all truck specifications and include all possible relations.
    // Adjust "include" as per exact relation names in your truckSpecification model.
    const truckSpecifications = await prisma.truckSpecification.findMany({
      include: {
        // Example relations; update based on actual Prisma model relations
        lengths: {
          include: {
            heights: {
              select: {
                heightFt: true,
                id: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: truckSpecifications,
    });
  } catch (err) {
    console.error("Error fetching truck specifications:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch truck specifications",
    });
  }
};
