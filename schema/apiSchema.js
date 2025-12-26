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

export const RegisterVehicleSchema = Joi.object({
  driverName: Joi.string().required().messages({
    'any.required': 'Driver name is required.',
  }),
  mobileNumber: Joi.string().required().messages({
    'any.required': 'Driver mobile number is required.',
  }),
  rcNumber: Joi.string().required().messages({
    'any.required': 'RC Book is required.',
  }),
  rcPhoto: Joi.string().required().messages({
    'any.required': 'RC photo is required.',
  }),
  truckType: Joi.string().required().messages({
    'any.required': 'Truck Type is required.',
  }),
  bodyType: Joi.string().required().messages({
    'any.required': 'Truck Body is required.',
  }),
  truckLength: Joi.string().required().messages({
    'any.required': 'Truck Length is required.',
  }),
  truckHeight: Joi.string().required().messages({
    'any.required': 'Truck Hight is required.',
  }),
  loadCapacity: Joi.string().required().messages({
    'any.required': 'Truck capacity is required.',
  }),
  imageIds: Joi.array().min(1).items(Joi.string()).required().messages({
    'any.required': 'Please upload and images.',
  }),
  referralCode: Joi.optional(),
});

export const UpdateVehicleSchema = Joi.object({
  driverName: Joi.string().required().messages({
    'any.required': 'Driver name is required.',
  }),
  mobileNumber: Joi.string().required().messages({
    'any.required': 'Driver mobile number is required.',
  }),
  rcNumber: Joi.string().required().messages({
    'any.required': 'RC Book is required.',
  }),
  rcPhoto: Joi.allow(null).messages({
    'any.required': 'RC photo is required.',
  }),
  truckType: Joi.string().required().messages({
    'any.required': 'Truck Type is required.',
  }),
  bodyType: Joi.string().required().messages({
    'any.required': 'Truck Body is required.',
  }),
  truckLength: Joi.string().required().messages({
    'any.required': 'Truck Length is required.',
  }),
  truckHeight: Joi.string().required().messages({
    'any.required': 'Truck Hight is required.',
  }),
  loadCapacity: Joi.string().required().messages({
    'any.required': 'Truck capacity is required.',
  }),
  imageIds: Joi.array().items(Joi.allow(null)).messages({
    'any.required': 'Please upload and images.',
  }),
  referralCode: Joi.optional(),
});

export const CreateBookingSchema = Joi.object({
  fromAddress: Joi.string().required().messages({
    'any.required': 'Pickup address is required.',
    'string.empty': 'Pickup address cannot be empty.',
  }),

  fromLatitude: Joi.number().required().messages({
    'any.required': 'Pickup latitude is required.',
  }),
  fromLongitude: Joi.number().required().messages({
    'any.required': 'Pickup longitude is required.',
  }),
  toAddress: Joi.string().required().messages({
    'any.required': 'Drop address is required.',
    'string.empty': 'Drop address cannot be empty.',
  }),
  toLatitude: Joi.number().required().messages({
    'any.required': 'Drop latitude is required.',
  }),
  toLongitude: Joi.number().required().messages({
    'any.required': 'Drop longitude is required.',
  }),
  bookingDate: Joi.date().required().messages({
    'any.required': 'Booking date is required.',
    'date.base': 'Booking date must be a valid date.',
  }),
  truckType: Joi.string().required().messages({
    'any.required': 'Truck type is required.',
  }),
  bodyType: Joi.string().required().messages({
    'any.required': 'Body type is required.',
  }),
  truckLength: Joi.string().required().messages({
    'any.required': 'Truck length is required.',
  }),
  loadCapacity: Joi.string().required().messages({
    'any.required': 'Load capacity is required.',
  }),
  truckHeight: Joi.string().required().messages({
    'any.required': 'Truck height is required.',
  }),
  estimatedKm: Joi.string().optional().messages({
    'any.required': 'Estimated kilometers is required.',
  }),
  driverNotes: Joi.string().required().messages({
    'any.required': 'Driver notes are required.',
  }),
});
