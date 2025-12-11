import prisma from '../lib/prisma.js';

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
