import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import { errorResponse } from './apiResponses.js';

config();

const JWT_SECRET = process.env.JWT_SECRET;

export const generateToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
};

export const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return errorResponse(res, 'No token provided', 403);
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return errorResponse(res, 'Failed to authenticate token', 401);
    }
    req.userId = decoded.id;
    next();
  });
};