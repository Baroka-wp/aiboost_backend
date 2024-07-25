import express, { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import { authMiddleware, AdminMiddleware, mentorAdminMiddleware } from '../utils/utils.js';
import cloudinary from 'cloudinary';
import multer from 'multer';
import path from 'path';
import fs from 'fs';


config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configuration de Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuration de multer pour l'upload des fichiers
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp/'); // Stockage temporaire
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const CoursesRoutes = Router();

// Fonction pour uploader l'image sur Cloudinary
const uploadToCloudinary = async (filePath) => {
  try {
    const result = await cloudinary.v2.uploader.upload(filePath, {
      folder: 'course_covers'
    });
    fs.unlinkSync(filePath); // Supprimer le fichier temporaire
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
};

// Get all courses
CoursesRoutes.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        chapters(id, title, content),
        categories(id, name),
        tags:course_tags(tags(id, name))
      `)
      .order('id', { ascending: true });

    if (error) throw error;

    // Transformation des données pour une meilleure structure
    const formattedData = data.map(course => ({
      ...course,
      category: course.categories,
      tags: course.tags.map(tag => tag.tags),
      chapters: course.chapters ? course.chapters.sort((a, b) => a.id - b.id) : []
    }));

    successResponse(res, formattedData, 'Courses retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve courses', 500, error);
  }
});

// Route pour créer un cours
CoursesRoutes.post('/', authMiddleware, AdminMiddleware, upload.single('coverImage'), async (req, res) => {
  const { title, description, price, category_id, duration, tags } = req.body;

  if (!title || !description || !category_id || !duration) {
    return errorResponse(res, 'Missing required fields', 400);
  }

  try {
    let coverImageUrl = null;
    if (req.file) {
      coverImageUrl = await uploadToCloudinary(req.file.path);
    }

    const parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags);

    const { data, error } = await supabase.rpc('create_course_with_tags', {
      p_title: title,
      p_description: description,
      p_price: price,
      p_category_id: category_id,
      p_duration: duration,
      p_tags: parsedTags,
      p_cover_image_url: coverImageUrl
    });

    if (error) throw error;

    successResponse(res, data, 'Course created successfully');
  } catch (error) {
    console.error('Error creating course:', error);
    errorResponse(res, 'Failed to create course', 500, error.message);
  }
});

// Obtenir toutes les catégories
CoursesRoutes.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });



    if (error) throw error;

    successResponse(res, data, 'Categories retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve categories', 500, error);
  }
});

// Create a new category
CoursesRoutes.post('/categories', authMiddleware, AdminMiddleware, async (req, res) => {
  const { name } = req.body;
  try {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .single();

    if (error) throw error;

    successResponse(res, data, 'Category created successfully');
  } catch (error) {
    errorResponse(res, 'Failed to create category', 500, error);
  }
});

// Get all tags
CoursesRoutes.get('/tags', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    successResponse(res, data, 'Tags retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve tags', 500, error);
  }
});

// Create a new tag
CoursesRoutes.post('/tags', authMiddleware, AdminMiddleware, async (req, res) => {
  const { name } = req.body;
  try {
    const { data, error } = await supabase
      .from('tags')
      .insert({ name })
      .single();

    if (error) throw error;

    successResponse(res, data, 'Tag created successfully');
  } catch (error) {
    errorResponse(res, 'Failed to create tag', 500, error);
  }
});


// Rechercher des cours
CoursesRoutes.get('/search', async (req, res) => {
  const { query, category, tags } = req.query;

  try {
    let coursesQuery = supabase
      .from('courses')
      .select(`
        *,
        categories(name),
        tags:course_tags(tags(name))
      `);

    if (query) {
      coursesQuery = coursesQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
    }

    if (category) {
      coursesQuery = coursesQuery.eq('category_id', category);
    }

    if (tags) {
      const tagArray = tags.split(',');
      coursesQuery = coursesQuery.contains('tags.name', tagArray);
    }

    const { data, error } = await coursesQuery;

    if (error) throw error;

    successResponse(res, data, 'Courses retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to search courses', 500, error);
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


// route pour inscrire un user a un cours
CoursesRoutes.post('/enroll/:courseId', authMiddleware, async (req, res) => {
  const { courseId } = req.params;
  const { email } = req.body;

  if (!email) {
    return errorResponse(res, 'Email is required', 400);
  }

  try {
    // Vérifier si le cours existe
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, enrolled_count')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      throw new Error('Course not found');
    }

    // Rechercher l'utilisateur par email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, enrolled_courses')
      .eq('email', email)
      .single();

    if (userError || !user) {
      throw new Error('User not found');
    }

    // Vérifier si l'utilisateur est déjà inscrit au cours
    const enrolledCourses = user.enrolled_courses || [];
    if (enrolledCourses.includes(parseInt(courseId))) {
      throw new Error('User already enrolled in this course');
    }

    // Ajouter le cours à la liste des cours inscrits de l'utilisateur
    enrolledCourses.push(parseInt(courseId));

    // Mettre à jour le profil de l'utilisateur
    const { error: updateUserError } = await supabase
      .from('users')
      .update({ enrolled_courses: enrolledCourses })
      .eq('id', user.id);

    if (updateUserError) {
      throw updateUserError;
    }

    // Incrémenter enrolled_count du cours
    const { error: updateCourseError } = await supabase
      .from('courses')
      .update({ enrolled_count: course.enrolled_count + 1 })
      .eq('id', courseId);

    if (updateCourseError) {
      throw updateCourseError;
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .contains('enrolled_courses', [courseId]);

    if (error) throw error;

    successResponse(res, data, 'Enrolled users retrieved successfully');
  } catch (error) {
    // En cas d'erreur, annuler la transaction
    console.log(error)
    errorResponse(res, error.message, 500, error);
  }
});

// Get a specific course by ID with its chapters
CoursesRoutes.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        chapters:chapters(id, title, content, position),
        categories(id, name),
        tags:course_tags(tags(id, name))
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


CoursesRoutes.post('/:courseId/enroll', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId } = req.params;
  const { userId } = req.body;

  try {
    const { data, error } = await supabase.rpc('enroll_user_in_course', {
      p_user_id: userId,
      p_course_id: parseInt(courseId)
    });

    if (error) throw error;

    successResponse(res, data, 'User enrolled successfully');
  } catch (error) {
    errorResponse(res, 'Failed to enroll user', 500, error);
  }
});

// Route pour désinscrire un utilisateur d'un cours
CoursesRoutes.delete('/:courseId/enrolled_users/:userId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId, userId } = req.params;

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('enrolled_courses')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    const updatedEnrolledCourses = user.enrolled_courses.filter(id => id !== parseInt(courseId));

    const { data: users, error } = await supabase
      .from('users')
      .update({ enrolled_courses: updatedEnrolledCourses })
      .eq('id', userId);

    if (error) throw error;

    // Vérifier si le cours existe
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, enrolled_count')
      .eq('id', courseId)
      .single();

    // Incrémenter enrolled_count du cours
    const { error: updateCourseError } = await supabase
      .from('courses')
      .update({ enrolled_count: course.enrolled_count - 1 })
      .eq('id', courseId);

    if (updateCourseError) {
      throw updateCourseError;
    }

    successResponse(res, users, 'User unenrolled successfully');
  } catch (error) {
    errorResponse(res, 'Failed to unenroll user', 500, error);
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
CoursesRoutes.post('/:courseId/validate-chapter', authMiddleware, mentorAdminMiddleware, async (req, res) => {
  const { chapterId, score, studentId } = req.body;
  const courseId = parseInt(req.params.courseId);

  if (score < 80) {
    return errorResponse(res, 'Score is below 80%, chapter not validated', 400);
  }

  try {
    // Récupérer la progression actuelle
    let { data: userProgress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', studentId)
      .eq('course_id', courseId)
      .single();

    if (!userProgress) {
      // Si aucune entrée n'existe, en créer une nouvelle
      const { data: newProgress, error: insertError } = await supabase
        .from('user_progress')
        .insert({
          user_id: studentId,
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
        .eq('user_id', studentId)
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
      return successResponse(res, { current_chapter_id: 1, completed_chapters: [] }, 'Default progress retrieved');
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


// submik work link
CoursesRoutes.post('/:courseId/chapters/:chapterId/submit-link', authMiddleware, async (req, res) => {
  const { courseId, chapterId } = req.params;
  const { link } = req.body;
  const userId = req.userId;

  try {
    const { data, error } = await supabase
      .from('submissions')
      .insert({
        user_id: userId,
        course_id: courseId,
        chapter_id: chapterId,
        link: link,
        status: 'pending'
      })
      .single();

    if (error) throw error;

    res.json({ success: true, submission: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// mettre à jour une soumission existante
CoursesRoutes.put('/submissions/:submissionId', authMiddleware, async (req, res) => {
  const { submissionId } = req.params;
  const { link } = req.body;
  const userId = req.userId;

  try {
    // Vérifier si la soumission existe et appartient à l'utilisateur
    const { data: existingSubmission, error: fetchError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      return errorResponse(res, 'Submission not found or you do not have permission to update it', 404);
    }

    // Mettre à jour la soumission
    const { data, error } = await supabase
      .from('submissions')
      .update({
        link,
        status: 'pending',
        updated_at: new Date()
      })
      .eq('id', submissionId)
      .single();

    if (error) throw error;

    successResponse(res, data, 'Submission updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update submission', 500, error);
  }
});


CoursesRoutes.get('/:courseId/chapters/:chapterId/submission-status', authMiddleware, async (req, res) => {
  const { courseId, chapterId } = req.params;
  const userId = req.userId;

  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('chapter_id', chapterId)
      .single()

    if (!data) {
      return successResponse(res, { status: 'not_submitted' }, 'Course progress retrieved successfully');
    }

    if (error) throw error;



    successResponse(res, data, 'Course progress retrieved successfully');

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// Route pour assigner un mentor à une soumission
CoursesRoutes.post('/submissions/:submissionId/assign', authMiddleware, mentorAdminMiddleware, async (req, res) => {
  const { submissionId } = req.params;
  const mentorId = req.userId;

  try {
    const { data, error } = await supabase
      .from('submissions')
      .update({ mentor_id: mentorId })
      .eq('id', submissionId)
      .is('mentor_id', null)
      .single();

    if (error) throw error;
    successResponse(res, data, 'Submission assigned successfully');
  } catch (error) {
    errorResponse(res, 'Failed to assign submission', 500, error);
  }
});

// Route pour mettre à jour un cours
CoursesRoutes.put('/:courseId', authMiddleware, AdminMiddleware, upload.single('coverImage'), async (req, res) => {
  const { courseId } = req.params;
  const { title, description, price, category_id, duration, tags } = req.body;

  try {
    let updateData = {
      title,
      description,
      price,
      category_id,
      duration
    };

    if (req.file) {
      updateData.cover_image_url = await uploadToCloudinary(req.file.path);
    }

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .update(updateData)
      .eq('id', courseId)
      .single();

    if (courseError) throw courseError;

    // Gestion des tags
    if (tags) {
      const tagArray = JSON.parse(tags);
      // Supprimer les anciens tags
      await supabase
        .from('course_tags')
        .delete()
        .eq('course_id', courseId);

      // Ajouter les nouveaux tags
      if (tagArray.length > 0) {
        const courseTagsInserts = tagArray.map(tag => ({
          course_id: courseId,
          tag_id: tag
        }));

        await supabase
          .from('course_tags')
          .insert(courseTagsInserts);
      }
    }

    // Récupération du cours mis à jour avec ses relations
    const { data: updatedCourse, error: fetchError } = await supabase
      .from('courses')
      .select(`
        *,
        categories(id, name),
        tags:course_tags(tags(id, name))
      `)
      .eq('id', courseId)
      .single();

    if (fetchError) throw fetchError;

    successResponse(res, updatedCourse, 'Course updated successfully');
  } catch (error) {
    console.error('Error updating course:', error);
    errorResponse(res, 'Failed to update course', 500, error.message);
  }
});

// Route pour supprimer un cours
CoursesRoutes.delete('/:courseId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId } = req.params;
  try {


    try {
      // Supprimer d'abord les tags associés
      await supabase
        .from('course_tags')
        .delete()
        .eq('course_id', courseId);

      // Ensuite, supprimer les chapitres associés
      await supabase
        .from('chapters')
        .delete()
        .eq('course_id', courseId);

      // Enfin, supprimer le cours
      const { data, error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId);

      if (error) throw error;
      successResponse(res, { id: courseId }, 'Course and its related data deleted successfully');
    } catch (error) {
      throw error;
    }
  } catch (error) {
    errorResponse(res, 'Failed to delete course', 500, error);
  }
});

// Route pour obtenir les utilisateurs inscrits à un cours
CoursesRoutes.get('/:courseId/enrolled-users', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId } = req.params;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .contains('enrolled_courses', [courseId]);

    if (error) throw error;

    successResponse(res, data, 'Enrolled users retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve enrolled users', 500, error);
  }
});


// Route pour ajouter un chapitre
CoursesRoutes.post('/:courseId/chapters', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId } = req.params;
  const { title, content } = req.body;
  try {
    // Vérifier si le cours existe

    // Ajouter le chapitre
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({ course_id: courseId, title, content })
      .single()

    if (chapterError) throw chapterError;

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .single()
      .select(`
        chapters(id, title, content)
      `);

    if (courseError) throw courseError;

    successResponse(res, course?.chapters, 'Chapter created successfully');
  } catch (error) {
    errorResponse(res, 'Failed to create chapter', 500, error);
  }
});

// Route pour mettre à jour un chapitre
CoursesRoutes.put('/:courseId/chapters/:chapterId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId, chapterId } = req.params;
  const { title, content } = req.body;
  try {
    const { data, error } = await supabase
      .from('chapters')
      .update({ title, content })
      .eq('id', chapterId)
      .eq('course_id', courseId)
      .single();

    if (error) throw error;

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .single()
      .select(`
        chapters(id, title, content)
      `);

    if (courseError) throw courseError;

    successResponse(res, course.chapters, 'Chapter updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update chapter', 500, error);
  }
});

// Route pour supprimer un chapitre
CoursesRoutes.delete('/:courseId/chapters/:chapterId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId, chapterId } = req.params;
  try {
    const { data, error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', chapterId)
      .eq('course_id', courseId);

    if (error) throw error;

    successResponse(res, { id: chapterId }, 'Chapter deleted successfully');
  } catch (error) {
    errorResponse(res, 'Failed to delete chapter', 500, error);
  }
});



export default CoursesRoutes;