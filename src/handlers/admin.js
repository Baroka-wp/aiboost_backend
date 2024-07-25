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
      .select('id, email, username, full_name, role')
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
        chapters(title, content)
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

// Mise à jour d'un utilisateur
AdminRoutes.put('/users/:userId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { email, full_name, username, role, password } = req.body;

  try {
    let updateData = { email, full_name, role, username };

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .single();

    if (error) throw error;

    successResponse(res, data, 'User updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update user', 500, error);
  }
});

// Suppression d'un utilisateur
AdminRoutes.delete('/users/:userId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    successResponse(res, data, 'User deleted successfully');
  } catch (error) {
    errorResponse(res, 'Failed to delete user', 500, error);
  }
});

// Suspension/réactivation d'un utilisateur
AdminRoutes.put('/users/:userId/suspend', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { is_suspended } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ is_suspended })
      .eq('id', userId)
      .single();

    if (error) throw error;

    successResponse(res, data, `User ${is_suspended ? 'suspended' : 'reactivated'} successfully`);
  } catch (error) {
    errorResponse(res, 'Failed to update user suspension status', 500, error);
  }
});

// Inscription d'un utilisateur à un cours
AdminRoutes.post('/users/:userId/enroll', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { course_id } = req.body;

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('enrolled_courses')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    const enrolledCourses = user.enrolled_courses || [];
    if (!enrolledCourses.includes(course_id)) {
      enrolledCourses.push(course_id);

      const { data, error } = await supabase
        .from('users')
        .update({ enrolled_courses: enrolledCourses })
        .eq('id', userId)
        .single();

      if (error) throw error;

      successResponse(res, data, 'User enrolled in course successfully');
    } else {
      successResponse(res, null, 'User already enrolled in this course');
    }
  } catch (error) {
    errorResponse(res, 'Failed to enroll user in course', 500, error);
  }
});

// Obtention de la progression d'un utilisateur
AdminRoutes.get('/users/:userId/progress', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const { data: enrolledCourses, error: enrolledError } = await supabase
      .from('users')
      .select('enrolled_courses')
      .eq('id', userId)
      .single();

    
    if (enrolledError) throw enrolledError;

    const courseIds = enrolledCourses.enrolled_courses || [];

    const { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .in('course_id', courseIds);

    if (progressError) throw progressError;

    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title, chapters(count)')
      .in('id', courseIds);

    if (coursesError) throw coursesError;

    const progressWithDetails = progress.map(p => {
      const course = courses.find(c => c.id === p.course_id);
      return {
        course_id: p.course_id,
        course_title: course.title,
        total_chapters: course.chapters[0].count,
        completed_chapters: p.completed_chapters,
        percentage: Math.round((p.completed_chapters.length / course.chapters[0].count) * 100)
      };
    });

    successResponse(res, progressWithDetails, 'User progress retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user progress', 500, error);
  }
});

// Récupérer tous les mentors avec pagination
AdminRoutes.get('/mentors', authMiddleware, AdminMiddleware, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('users')
      .select('id, email, username, full_name, role, is_suspended', { count: 'exact' })
      .eq('role', 'mentor')
      .range(offset, offset + limit - 1)
      .order('id', { ascending: true });

    if (error) throw error;

    const totalPages = Math.ceil(count / limit);

    successResponse(res, { mentors: data, totalPages, currentPage: page }, 'Mentors retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve mentors', 500, error);
  }
});

// Récupérer tous les étudiants avec pagination
AdminRoutes.get('/students', authMiddleware, AdminMiddleware, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('users')
      .select('id, email, username, full_name, role, is_suspended, enrolled_courses', { count: 'exact' })
      .eq('role', 'student')
      .range(offset, offset + limit - 1)
      .order('id', { ascending: true });

    if (error) throw error;

    const totalPages = Math.ceil(count / limit);

    // Récupérer les informations des cours pour chaque étudiant
    const studentsWithCourseInfo = await Promise.all(data.map(async (student) => {
      if (student.enrolled_courses && student.enrolled_courses.length > 0) {
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses')
          .select('id, title')
          .in('id', student.enrolled_courses);

        if (coursesError) throw coursesError;

        // Récupérer la progression pour chaque cours
        const progressPromises = student.enrolled_courses.map(async (courseId) => {
          const { data: progressData, error: progressError } = await supabase
            .from('user_progress')
            .select('completed_chapters')
            .eq('user_id', student.id)
            .eq('course_id', courseId)
            .single();

          if (progressError && progressError.code !== 'PGRST116') throw progressError;

          return {
            courseId,
            progress: progressData ? (progressData.completed_chapters.length / coursesData.find(c => c.id === courseId).chapters_count) * 100 : 0
          };
        });

        const progressData = await Promise.all(progressPromises);

        return {
          ...student,
          courses: coursesData.map(course => ({
            ...course,
            progress: progressData.find(p => p.courseId === course.id).progress
          }))
        };
      }
      return student;
    }));

    successResponse(res, { students: studentsWithCourseInfo, totalPages, currentPage: page }, 'Students retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve students', 500, error);
  }
});


export default AdminRoutes;