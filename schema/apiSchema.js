import Joi from 'joi';

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.base': 'Email must be a string.',
    'string.empty': 'Email is required.',
    'string.email': 'Email format is invalid.',
    'any.required': 'Email is required.',
  }),
  password: Joi.string().min(6).required().messages({
    'string.base': 'Password must be a string.',
    'string.empty': 'Password is required.',
    'string.min': 'Password must be at least 6 characters long.',
    'any.required': 'Password is required.',
  }),
});

export const registerSchema = Joi.object({
  name: Joi.string().required().messages({
    'string.base': 'Name must be a string.',
    'string.empty': 'Name is required.',
    'any.required': 'Name is required.',
  }),
  email: Joi.string().email().required().messages({
    'string.base': 'Email must be a string.',
    'string.empty': 'Email is required.',
    'string.email': 'Email format is invalid.',
    'any.required': 'Email is required.',
  }),
  password: Joi.string().min(6).required().messages({
    'string.base': 'Password must be a string.',
    'string.empty': 'Password is required.',
    'string.min': 'Password must be at least 6 characters long.',
    'any.required': 'Password is required.',
  }),
  confirm_password: Joi.string()
    .required()
    .valid(Joi.ref('password'))
    .messages({
      'any.only': 'Confirm password must match password.',
      'any.required': 'Confirm password is required.',
      'string.empty': 'Confirm password is required.',
    }),
  mobile: Joi.string().required().messages({
    'string.base': 'Mobile must be a string.',
    'string.empty': 'Mobile is required.',
    'any.required': 'Mobile is required.',
  }),
});

export const createPostSchema = Joi.object({
  title: Joi.string().required().messages({
    'string.base': 'Title must be a string.',
    'string.empty': 'Title is required.',
  }),
  content: Joi.string().required().messages({
    'string.base': 'Content must be a string.',
    'any.required': 'Content is required.',
  }),
  imageIds: Joi.array().min(1).items(Joi.string()).required().messages({
    'any.required': 'Please upload and images.',
  }),
});
