import prisma from '../lib/prisma.js';

export const getVehicles = async (req, res) => {
  try {
    // Fetch vehicles with image info from media table for each vehicle
    let vehicles = await prisma.vehicle.findMany({
      where: {
        ownerId: req.userId,
      },
    });

    // For backward compatibility, add imageIds as array of the image ids
    // Upgrade: Use Promise.all with map for proper async behavior and avoid unresolved Promises in result
    vehicles = await Promise.all(
      vehicles.map(async (v) => {
        const images = await prisma.media.findMany({
          where: {
            id: {
              in: v.imageIds || [],
            },
          },
          select: {
            id: true,
            url: true,
            type: true,
          },
        });
        return {
          ...v,
          images: images,
        };
      })
    );

    return res.status(200).json({
      success: true,
      vehicles,
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching vehicles.',
      error: error.message,
    });
  }
};

export const getVehicleById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find vehicle by id and (optionally) by ownerId, to restrict to current user
    const vehicle = await prisma.vehicle.findUnique({
      where: {
        id: id,
        ownerId: req.userId,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found.',
      });
    }

    // Fetch images for vehicle from media collection
    const images = await prisma.media.findMany({
      where: {
        id: {
          in: vehicle.imageIds || [],
        },
      },
      select: {
        id: true,
        url: true,
        type: true,
      },
    });

    // Fetch images for vehicle from media collection
    const rcPhoto = await prisma.media.findFirst({
      where: {
        id: vehicle.rcPhoto,
      },
      select: {
        id: true,
        url: true,
        type: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        ...vehicle,
        images,
        rcPhotoImage: rcPhoto,
      },
    });
  } catch (error) {
    console.error('Error fetching vehicle by ID:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching vehicle details.',
      error: error.message,
    });
  }
};

export const registerVehicle = async (req, res) => {
  try {
    const params = {
      ...req.body,
      status: 'pending',
      ownerId: req.userId,
      // Optionally, set ownerId from req.user if available
      // ownerId: req.user && req.user.id ? req.user.id : undefined,
    };

    // Insert data into the Vehicle table
    const vehicle = await prisma.vehicle.create({
      data: params,
    });

    return res.status(201).json({
      success: true,
      message: 'Vehicle registered successfully',
      vehicle,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      // Unique constraint failed (e.g., rcNumber already exists)
      return res.status(400).json({
        success: false,
        message: 'Vehicle with this RC Number already exists.',
      });
    }
    console.error('Error registering vehicle:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while registering the vehicle.',
      error: error.message,
    });
  }
};

export const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Update vehicle data
    const { rcPhoto, imageIds } = updateData;

    // Find the vehicle by id and ownerId before updating
    const existingVehicle = await prisma.vehicle.findFirst({
      where: {
        id: id,
        ownerId: req.userId,
      },
    });

    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found.',
      });
    }
    const updatedVehicle = await prisma.vehicle.updateMany({
      where: {
        id: id,
        ownerId: req.userId,
      },
      data: {
        ...updateData,
        // Only update rcPhoto if provided
        rcPhoto: rcPhoto === null ? existingVehicle.rcPhoto : rcPhoto,
        // Only update imageIds if provided
        imageIds: imageIds.length === 0 ? existingVehicle.imageIds : imageIds,
      },
    });

    if (updatedVehicle.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found or no changes made.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the vehicle.',
      error: error.message,
    });
  }
};

export const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete vehicle
    const deletedVehicle = await prisma.vehicle.deleteMany({
      where: {
        id: id,
        ownerId: req.userId,
      },
    });

    if (deletedVehicle.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the vehicle.',
      error: error.message,
    });
  }
};
