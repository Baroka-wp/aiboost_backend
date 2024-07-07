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

    successResponse(res, updatedUser, 'Enrollment successful');
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
  const userId = req.userId;
  const courseId = parseInt(req.params.courseId);

  // Commencer une transaction
  const { data, error } = await supabase.rpc('update_user_progress', {
    p_user_id: userId,
    p_course_id: courseId,
    p_chapter_id: chapterId
  });

  if (error) {
    console.error('Error updating user progress:', error);
    return errorResponse(res, 'Failed to update user progress', 500, error);
  }

  successResponse(res, data, 'User progress updated successfully');
});

// Validate chapter after successful QCM
CoursesRoutes.post('/:courseId/validate-chapter', authMiddleware, async (req, res) => {
  const { chapterId, score } = req.body;
  const userId = req.userId;
  const courseId = parseInt(req.params.courseId);

  if (score < 80) {
    return errorResponse(res, 'Score is below 80%, chapter not validated', 400);
  }

  try {
    // Récupérer la progression actuelle
    let { data: userProgress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .single();

    if (progressError) throw progressError;

    if (!userProgress) {
      // Si aucune entrée n'existe, en créer une nouvelle
      const { data: newProgress, error: insertError } = await supabase
        .from('user_progress')
        .insert({
          user_id: userId,
          course_id: courseId,
          current_chapter_id: chapterId,
          completed_chapters: [chapterId]
        })
        .single();

      if (insertError) throw insertError;
      userProgress = newProgress;
    } else {
      const updatedCompletedChapters =
        userProgress.completed_chapters.includes(chapterId)
          ? userProgress.completed_chapters
          : [...userProgress.completed_chapters, chapterId];

      const { data: updatedProgress, error: updateError } = await supabase
        .from('user_progress')
        .update({
          current_chapter_id: chapterId,
          completed_chapters: updatedCompletedChapters
        })
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .single();

      if (updateError) throw updateError;
      userProgress = updatedProgress;
    }

    successResponse(res, userProgress, 'Chapter validated and progress updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to validate chapter and update progress', 500, error);
  }
});

// Get user progress for a specific course
CoursesRoutes.get('/:courseId/progress', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const courseId = parseInt(req.params.courseId);

  try {
    const { data: userProgress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .single();

    if (progressError && progressError.code !== 'PGRST116') {
      throw progressError;
    }

    if (!userProgress) {
      return successResponse(res, { current_chapter_id: 1, completed_chapter: [] }, 'Default progress retrieved');
    }

    successResponse(res, userProgress, 'User progress retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user progress', 500, error);
  }
});

// Get progress for all enrolled courses
CoursesRoutes.get('/enrolled/progress/:userId', authMiddleware, async (req, res) => {
  const userId = req.params.userId;

  try {
    // Récupérer les cours inscrits de l'utilisateur
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('enrolled_courses')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    const enrolledCoursesIds = user.enrolled_courses || [];

    if (enrolledCoursesIds.length === 0) {
      return successResponse(res, [], 'User has no enrolled courses');
    }

    // Récupérer la progression pour tous les cours inscrits
    const { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .in('course_id', enrolledCoursesIds);

    if (progressError) throw progressError;

    // Récupérer le nombre total de chapitres pour chaque cours
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, chapters(count)')
      .in('id', enrolledCoursesIds);

    if (coursesError) throw coursesError;

    // Calculer le pourcentage de progression pour chaque cours
    const progressWithPercentage = progress.map(p => {
      const course = courses.find(c => c.id === p.course_id);
      const totalChapters = course.chapters[0].count;
      const completedChapters = p.completed_chapters ? p.completed_chapters.length : 0;
      const percentage = Math.round((completedChapters / totalChapters) * 100);
      return {
        ...p,
        totalChapters,
        percentage
      };
    });

    successResponse(res, progressWithPercentage, 'Course progress retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve course progress', 500, error);
  }
});

export default CoursesRoutes;