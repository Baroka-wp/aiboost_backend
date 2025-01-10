import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/utils.js';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import { authMiddleware } from '../utils/utils.js';

config();

const prisma = new PrismaClient();
const RegistrationRoutes = Router();

// Register new user
RegistrationRoutes.post('/register', async (req, res) => {
  const { email, password, username, full_name } = req.body;

  try {
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer le nouvel utilisateur
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
        full_name,
        role: 'USER' // Valeur par défaut du enum UserRole
      },
      select: {
        id: true,
        email: true,
        username: true,
        full_name: true,
        role: true
      }
    });

    // Générer le token
    const token = generateToken(newUser);

    successResponse(res, { token, user: newUser }, "User registered successfully", 201);
  } catch (error) {
    console.error('Registration error:', error);
    errorResponse(res, 'Registration failed', 400, error);
  }
});

// Login user
RegistrationRoutes.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({ message: "User with this email not found" });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Créer une version de l'utilisateur sans le mot de passe
    const userWithoutPassword = {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      enrolled_courses: user.enrolled_courses
    };

    // Générer un token JWT
    const token = generateToken(userWithoutPassword);

    res.json({ message: "Login successful", token, user: userWithoutPassword });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user profile
RegistrationRoutes.get('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.params.id !== req.userId.toString()) {
      return errorResponse(res, 'Unauthorized access', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        id: true,
        email: true,
        username: true,
        full_name: true,
        role: true,
        enrolled_courses: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    successResponse(res, user, 'User profile retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user profile', 400, error);
  }
});

// Update user profile
RegistrationRoutes.put('/users/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { email, full_name, username, role, password } = req.body;

  try {
    // Préparer les données de mise à jour
    let updateData = {
      email,
      full_name,
      username
    };

    // Ajouter le rôle si fourni (et vérifie qu'il correspond à l'enum UserRole)
    if (role) {
      updateData.role = role;
    }

    // Ajouter le mot de passe s'il est fourni
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    // Mettre à jour l'utilisateur
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        full_name: true,
        role: true,
        created_at: true,
        updated_at: true
      }
    });

    successResponse(res, updatedUser, 'User updated successfully');
  } catch (error) {
    if (error.code === 'P2002') {
      errorResponse(res, 'Email or username already exists', 400, error);
    } else {
      errorResponse(res, 'Failed to update user', 500, error);
    }
  }
});

export default RegistrationRoutes;