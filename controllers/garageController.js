import prisma from "../lib/prisma.js";

export const getCreateGarageAmount = async (req, res) => {
  try {
    // Let's assume the SystemSetting table/key for garage creation amount is 'create_garage_amount'
    const setting = await prisma.systemSetting.findFirst();

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Create garage amount is not set in the system.",
      });
    }

    return res.json({
      success: true,
      createGarageAmount: Number(setting.garageCreateAmount),
      message: "Create garage amount fetched successfully.",
    });
  } catch (error) {
    console.error("Error fetching create garage amount:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch create garage amount.",
    });
  }
};

/**
 * Get nearby garages within a given radius (in km) from a latitude/longitude point.
 * API expects query params: lat (latitude), lng (longitude), radius (km, optional, default 10)
 */
export const getNearByGarages = async (req, res) => {
  try {
    const { lat, lng, radius = 10, type } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude (lat) and Longitude (lng) are required.",
      });
    }

    // Convert to floats
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius);

    // Approximate earth radius in km
    const earthRadiusInKm = 6371;

    // Calculate bounding box for optimization
    const latDelta = (searchRadius / earthRadiusInKm) * (180 / Math.PI);
    const lngDelta =
      (searchRadius /
        (earthRadiusInKm * Math.cos((Math.PI / 180) * latitude))) *
      (180 / Math.PI);

    const minLat = latitude - latDelta;
    const maxLat = latitude + latDelta;
    const minLng = longitude - lngDelta;
    const maxLng = longitude + lngDelta;

    console.log("type", type);
    // First, filter garages by bounding box to reduce dataset
    const garages = await prisma.garage.findMany({
      where: {
        latitude: { gte: minLat, lte: maxLat },
        longitude: { gte: minLng, lte: maxLng },
        ...(type
          ? {
              types: {
                has: typeof type === "string" ? type.toLowerCase() : type,
              },
            }
          : {}),
        isVerified: true,
      },
    });

    // Then, accurately filter by the "haversine" distance formula
    function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
      const toRad = (value) => (value * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return earthRadiusInKm * c;
    }

    const nearbyGarages = garages
      .map((garage) => {
        const distance = getDistanceFromLatLonInKm(
          latitude,
          longitude,
          garage.latitude,
          garage.longitude,
        );
        return { ...garage, distance };
      })
      .filter((g) => g.distance <= searchRadius)
      .sort((a, b) => a.distance - b.distance);

    console.log("nearbyGarages", JSON.stringify(nearbyGarages.length));
    return res.status(200).json({
      success: true,
      garages: nearbyGarages,
    });
  } catch (error) {
    console.error("Error fetching nearby garages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch nearby garages",
      error: error.message,
    });
  }
};

export const getMyGarages = async (req, res) => {
  try {
    // Assume req.user.id is available (user is authenticated)
    const userId = req.userId;
    if (!userId) {
      return {
        success: false,
        message: "Unable to load garages.",
        data: null,
      };
    }

    // Fetch garages owned by the user
    const garages = await prisma.garage.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    // For each garage, fetch images from the images table based on garageId
    const garagesWithImages = await Promise.all(
      garages.map(async (garage) => {
        // Assuming you have an "images" table/model with a garageId field
        const images = await prisma.media.findMany({
          where: {
            id: {
              in: garage.images,
            },
          },
          select: {
            url: true,
          },
        });
        // Flatten into an array of urls
        const imageUrls = images.map((img) => img.url);
        return {
          ...garage,
          images: imageUrls,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      data: { garages: garagesWithImages },
    });
  } catch (error) {
    console.error("Error fetching user garages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch garages",
      error: error.message,
    });
  }
};

export const getGarageById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    // Validate id
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Garage ID is required",
      });
    }

    const garage = await prisma.garage.findUnique({
      where: { id: id, userId },
    });

    if (!garage) {
      return res.status(404).json({
        success: false,
        message: "Garage not found",
      });
    }

    // Fetch images from media table
    let imageUrls = [];
    if (
      garage.images &&
      Array.isArray(garage.images) &&
      garage.images.length > 0
    ) {
      const images = await prisma.media.findMany({
        where: { id: { in: garage.images } },
        select: { url: true },
      });
      imageUrls = images.map((img) => img.url);
    }

    const garageWithImages = { ...garage, imageUrls };
    return res.status(200).json({
      success: true,
      data: garageWithImages,
    });
  } catch (error) {
    console.error("Error fetching garage by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch garage",
      error: error.message,
    });
  }
};

export const deleteGarageById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Garage ID is required",
      });
    }

    // Find the garage to confirm ownership and get image IDs (if any)
    const garage = await prisma.garage.findUnique({
      where: { id: id, userId },
    });

    if (!garage) {
      return res.status(404).json({
        success: false,
        message: "Garage not found",
      });
    }

    // Optionally, remove associated images from media if desired
    if (
      garage.images &&
      Array.isArray(garage.images) &&
      garage.images.length > 0
    ) {
      await prisma.media.deleteMany({
        where: { id: { in: garage.images } },
      });
    }
    // REMOVE IMAGES FROM STORAGE HERE>...
    await prisma.garage.delete({
      where: { id: id, userId },
    });

    return res.status(200).json({
      success: true,
      message: "Garage deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting garage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete garage",
      error: error.message,
    });
  }
};

export const createGarage = async (req, res) => {
  try {
    const {
      name,
      mobile,
      latitude,
      longitude,
      address,
      images,
      ownerAadhaar,
      types,
    } = req.body;
    const userId = req.userId;
    // Basic validation (could be expanded)
    if (
      !name ||
      !mobile ||
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !address ||
      !images ||
      !Array.isArray(images) ||
      !ownerAadhaar ||
      !types
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid required fields",
      });
    }

    const garageData = {
      name,
      mobile,
      latitude,
      longitude,
      address,
      images,
      ownerAadhaar,
      types,
      userId,
    };

    console.log("garageData", garageData);

    const garage = await prisma.garage.create({
      data: garageData,
    });

    return res.status(201).json({
      success: true,
      message: "Garage created successfully",
      garage,
    });
  } catch (error) {
    console.error("Error creating garage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create garage",
      error: error.message,
    });
  }
};

// Update garage details by ID
export const updateGarage = async (req, res) => {
  try {
    const { id } = req.params; // get garage id from route param
    const userId = req.userID;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Garage ID is required",
      });
    }
    // Check if the garage exists and is owned by the user
    const garage = await prisma.garage.findUnique({
      where: {
        id: id,
        userId: userId,
      },
    });

    if (!garage) {
      return res.status(404).json({
        success: false,
        message: "Garage not found",
      });
    }

    // destructure keys to update
    const {
      name,
      mobile,
      latitude,
      longitude,
      address,
      ownerAadhaar,
      types,
      images,
    } = req.body;
    const updateData = {
      name,
      mobile,
      latitude,
      longitude,
      address,
      ownerAadhaar,
      types,
      images,
    };

    const updatedGarage = await prisma.garage.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Garage updated successfully",
      garage: updatedGarage,
    });
  } catch (error) {
    console.error("Error updating garage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update garage",
      error: error.message,
    });
  }
};
