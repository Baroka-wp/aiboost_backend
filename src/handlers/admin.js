import express, { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/utils.js';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import { authMiddleware, AdminMiddleware, mentorAdminMiddleware } from '../utils/utils.js';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const AdminRoutes = Router();


AdminRoutes.get('/users', authMiddleware, AdminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('email, username, full_name, role')
      .order('id', { ascending: true });

    if (error) throw error;

    successResponse(res, data, 'Users retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve users', 500, error);
  }
});


AdminRoutes.post('/users', authMiddleware, AdminMiddleware, async (req, res) => {
  const { email, password, username, full_name, role } = req.body;

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
        role
      })
      .select('email, username, full_name, role')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw new Error(insertError.message);
    }

    successResponse(res, { user: data }, "User registered successfully", 201);
  } catch (error) {
    errorResponse(res, 'Failed to create user', 500, error);
  }
});


AdminRoutes.get('/mentor/submissions', authMiddleware, mentorAdminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        users(full_name, email),
        courses(title),
        chapters(title)
      `)
      .in('status', ['pending', 'needs_revision'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    successResponse(res, data, 'Submissions retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve submissions', 500, error);
  }
});


AdminRoutes.put('/mentor/submissions/:submissionId', authMiddleware, mentorAdminMiddleware, async (req, res) => {
  const { submissionId } = req.params;
  const { status, mentor_comment } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('submissions')
      .update({ status, mentor_comment })
      .eq('id', submissionId)
      .single();
    
    if (error) throw error;

    successResponse(res, data, 'Submission updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update submission', 500, error);
  }
});

export default AdminRoutes;