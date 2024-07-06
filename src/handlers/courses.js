import express, { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import { authMiddleware } from '../utils/utils.js';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CoursesRoutes = Router();

// Get all courses
CoursesRoutes.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('*');

    if (error) throw error;

    successResponse(res, data, 'Courses retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve courses', 500, error);
  }
});

// Get enrolled courses for a user
CoursesRoutes.get('/enrolled', authMiddleware, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('enrolled_courses')
      .eq('id', req.userId)
      .single();

    if (userError) throw userError;

    const enrolledCoursesIds = user.enrolled_courses || [];

    if (enrolledCoursesIds.length === 0) {
      return successResponse(res, [], 'User has no enrolled courses');
    }

    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .in('id', enrolledCoursesIds);

    if (coursesError) throw coursesError;

    successResponse(res, courses, 'Enrolled courses retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve enrolled courses', 500, error);
  }
});

CoursesRoutes.post('/enroll/:courseId', authMiddleware, async (req, res) => {
  const { courseId } = req.params;
  const userId = req.userId;

  try {
    // Vérifier si le cours existe
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      return errorResponse(res, 'Course not found', 404);
    }

    // Récupérer les cours inscrits de l'utilisateur
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('enrolled_courses')
      .eq('id', userId)
      .single();

    if (userError) {
      throw userError;
    }

    // Vérifier si l'utilisateur est déjà inscrit au cours
    const enrolledCourses = user.enrolled_courses || [];
    if (enrolledCourses.includes(parseInt(courseId))) {
      return errorResponse(res, 'User already enrolled in this course', 400);
    }

    // Ajouter le cours à la liste des cours inscrits
    enrolledCourses.push(parseInt(courseId));

    // Mettre à jour le profil de l'utilisateur
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ enrolled_courses: enrolledCourses })
      .eq('id', userId)
      .single();

    if (updateError) {
      throw updateError;
    }

    successResponse(res, updatedUser , 'Enrollment successful');
  } catch (error) {
    errorResponse(res, 'Failed to enroll in the course', 500, error);
  }
});

// Get a specific course by ID with its chapters
CoursesRoutes.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        chapters:chapters(id, title, content, position)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Course not found', 404);
    }

    if (data.chapters) {
      data.chapters.sort((a, b) => a.id - b.id);
    }

    successResponse(res, data, 'Course and chapters retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve course and chapters', 500, error);
  }
});

// Get content of a specific chapter in a course
CoursesRoutes.get('/:courseId/chapters/:chapterId', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('chapters')
      .eq('id', req.params.courseId)
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Course not found', 404);
    }

    const chapter = data.chapters.find(ch => ch.id === parseInt(req.params.chapterId));

    if (!chapter) {
      return errorResponse(res, 'Chapter not found', 404);
    }

    successResponse(res, chapter.content, 'Chapter content retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve chapter content', 500, error);
  }
});

// Update user progress
CoursesRoutes.post('/:courseId/progress', authMiddleware, async (req, res) => {
  const { chapterId } = req.body;

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('progress')
      .eq('id', req.userId)
      .single();

    if (userError) throw userError;

    let progress = user.progress || {};

    if (!progress[req.params.courseId]) {
      progress[req.params.courseId] = {
        completedChapters: [],
        currentChapter: parseInt(chapterId)
      };
    }

    if (!progress[req.params.courseId].completedChapters.includes(parseInt(chapterId))) {
      progress[req.params.courseId].completedChapters.push(parseInt(chapterId));
      progress[req.params.courseId].currentChapter = parseInt(chapterId) + 1;
    }

    const { data, error } = await supabase
      .from('users')
      .update({ progress })
      .eq('id', req.userId)
      .single();

    if (error) throw error;

    successResponse(res, progress[req.params.courseId], 'User progress updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update user progress', 500, error);
  }
});

// Get user progress for a specific course
CoursesRoutes.get('/:courseId/progress', authMiddleware, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('progress')
      .eq('id', req.userId)
      .single();

    if (userError) throw userError;

    const progress = user.progress && user.progress[req.params.courseId]
      ? user.progress[req.params.courseId]
      : { completedChapters: [], currentChapter: 1 };

    successResponse(res, progress, 'User progress retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user progress', 500, error);
  }
});

export default CoursesRoutes;