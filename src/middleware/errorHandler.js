import { errorResponse } from '../utils/apiResponses.js';

export const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong';
  
  errorResponse(res, message, statusCode, err);
};