import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import { errorResponse } from './apiResponses.js';

config();

const JWT_SECRET = process.env.JWT_SECRET;

export const generateToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
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

export const mentorAdminMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return errorResponse(res, 'Failed to authenticate token', 401);
    }  
    if(decoded.role ===  'mentor' || decoded.role === 'admin') {
      next();
    } else {
      return errorResponse(res, 'Access denied. Mentor or Admin role required.', 403);
    }
    
  });
};

export const AdminMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return errorResponse(res, 'Failed to authenticate token', 401);
    }    
    if(decoded.role === 'admin') {
      next();
    } else {
      return errorResponse(res, 'Access denied. Admin role required.', 403);
    }
    
  });
};