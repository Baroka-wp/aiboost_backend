export const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

export const errorResponse = (res, message = 'An error occurred', statusCode = 500, error = null) => {
  res.status(statusCode).json({
    success: false,
    message,
    error: error?.message || error
  });
};