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
