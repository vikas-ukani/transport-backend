import prisma from '../lib/prisma.js';

export const getUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({});
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const newUser = await userService.createUserService(req.body);
    res.status(201).json(newUser);
  } catch (error) {
    next(error);
  }
};

export const partialUpdate = async (req, res, next) => {
  try {
    const { id, ...updateData } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required for partial update.',
      });
    }

    // Remove any fields that should not be updated
    delete updateData.password; // Don't allow password update here
    delete updateData.email; // Don't allow email update here

    // Clean undefined or null properties
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined || updateData[key] === null) {
        delete updateData[key];
      }
    });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};
