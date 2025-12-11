export const validateRequest = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body); // Validate req.body, or req.query, or req.params
  if (error) {
    return res
      .status(400)
      .json({ success: false, message: error.details[0].message });
  }
  next();
};
