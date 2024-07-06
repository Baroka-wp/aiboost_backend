import express, { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/utils.js';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import { authMiddleware } from '../utils/utils.js';


config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);


const RegistrationRoutes = Router();

RegistrationRoutes.post('/register', async (req, res) => {
  const { email, password, username, full_name } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    const { data, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password: hashedPassword,
        username,
        full_name,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw new Error(insertError.message);
    }

    const token = generateToken(data);

    successResponse(res, { token, user: data }, "User registered successfully", 201);
  } catch (error) {
    errorResponse(res, 'Registration failed', 400, error);
  }
});

RegistrationRoutes.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Générer un jeton JWT
    const token = generateToken(user);

    res.json({ message: "Login successful", token, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

RegistrationRoutes.get('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.params.id !== req.userId) {
      return errorResponse(res, 'Unauthorized access', 403);
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'User not found', 404);
    }

    delete data.password;

    successResponse(res, data, 'User profile retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user profile', 400, error);
  }
});

// Mettre à jour le profil d'un utilisateur
RegistrationRoutes.put('/users/:id', async (req, res) => {
  const { username, full_name } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ username, full_name })
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


export default RegistrationRoutes