import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import { authMiddleware, AdminMiddleware, mentorAdminMiddleware } from '../utils/utils.js';
import cloudinary from 'cloudinary';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { emailHTMLTemlate, AdminEmailContent } from '../utils/mailHTML.js';
import { SendEmail } from '../utils/utils.js';

config();

const prisma = new PrismaClient();

// Configuration de Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuration de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp/');
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
    fs.unlinkSync(filePath);
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
};

// Get all courses
CoursesRoutes.get('/', async (req, res) => {
  try {
    const data = await prisma.course.findMany({
      include: {
        chapters: {
          select: {
            id: true,
            title: true,
            content: true
          }
        },
        category: {
          select: {
            id: true,
            name: true
          }
        },
        course_tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        id: 'asc'
      }
    });

    const formattedData = data.map(course => ({
      ...course,
      tags: course.course_tags.map(ct => ct.tag),
      chapters: course.chapters.sort((a, b) => a.id - b.id)
    }));

    successResponse(res, formattedData, 'Courses retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve courses', 500, error);
  }
});

// Create course
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

    const course = await prisma.course.create({
      data: {
        title,
        description,
        price: parseFloat(price),
        category_id: parseInt(category_id),
        duration,
        cover_image_url: coverImageUrl,
        course_tags: {
          create: parsedTags.map(tagId => ({
            tag: {
              connect: { id: parseInt(tagId) }
            }
          }))
        }
      },
      include: {
        category: true,
        course_tags: {
          include: {
            tag: true
          }
        }
      }
    });

    successResponse(res, course, 'Course created successfully');
  } catch (error) {
    console.error('Error creating course:', error);
    errorResponse(res, 'Failed to create course', 500, error.message);
  }
});

// Get categories
CoursesRoutes.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    successResponse(res, categories, 'Categories retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve categories', 500, error);
  }
});

// Create category
CoursesRoutes.post('/categories', authMiddleware, AdminMiddleware, async (req, res) => {
  const { name } = req.body;
  try {
    const category = await prisma.category.create({
      data: { name }
    });

    successResponse(res, category, 'Category created successfully');
  } catch (error) {
    errorResponse(res, 'Failed to create category', 500, error);
  }
});

// Get tags
CoursesRoutes.get('/tags', async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    successResponse(res, tags, 'Tags retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve tags', 500, error);
  }
});

// Create tag
CoursesRoutes.post('/tags', authMiddleware, AdminMiddleware, async (req, res) => {
  const { name } = req.body;
  try {
    const tag = await prisma.tag.create({
      data: { name }
    });

    successResponse(res, tag, 'Tag created successfully');
  } catch (error) {
    errorResponse(res, 'Failed to create tag', 500, error);
  }
});

// Search courses
CoursesRoutes.get('/search', async (req, res) => {
  const { query, category, tags } = req.query;

  try {
    let whereClause = {};

    if (query) {
      whereClause.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } }
      ];
    }

    if (category) {
      whereClause.category_id = parseInt(category);
    }

    if (tags) {
      const tagArray = tags.split(',').map(Number);
      whereClause.course_tags = {
        some: {
          tag_id: {
            in: tagArray
          }
        }
      };
    }

    const courses = await prisma.course.findMany({
      where: whereClause,
      include: {
        category: true,
        course_tags: {
          include: {
            tag: true
          }
        }
      }
    });

    successResponse(res, courses, 'Courses retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to search courses', 500, error);
  }
});

// Get enrolled courses
CoursesRoutes.get('/enrolled', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { enrolled_courses: true }
    });

    if (!user.enrolled_courses.length) {
      return successResponse(res, [], 'User has no enrolled courses');
    }

    const courses = await prisma.course.findMany({
      where: {
        id: {
          in: user.enrolled_courses
        }
      }
    });

    successResponse(res, courses, 'Enrolled courses retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve enrolled courses', 500, error);
  }
});

// Enroll in course
CoursesRoutes.post('/enroll/:courseId', authMiddleware, async (req, res) => {
  const { courseId } = req.params;
  const { email } = req.body;

  if (!email) {
    return errorResponse(res, 'Email is required', 400);
  }

  try {
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseId) },
      include: {
        chapters: {
          select: {
            id: true,
            title: true,
            content: true
          }
        }
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.enrolled_courses.includes(parseInt(courseId))) {
      throw new Error('User already enrolled in this course');
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        enrolled_courses: {
          push: parseInt(courseId)
        }
      }
    });

    await prisma.course.update({
      where: { id: parseInt(courseId) },
      data: {
        enrolled_count: {
          increment: 1
        }
      }
    });

    // Email sending logic remains the same
    const REACT_APP_URL = process.env.REACT_APP_URL;
    const emailHtml = emailHTMLTemlate({ course, courseId, user, REACT_APP_URL });
    const adminEmailHTML = AdminEmailContent({ course, user, email });

    await SendEmail({
      mail: email,
      name: user.full_name,
      subject: `Bienvenue au cours : ${course.title}`,
      HTMLPart: emailHtml
    });

    await SendEmail({
      mail: "birotori@gmail.com",
      name: "Baroka",
      subject: `Nouvelle inscription : ${course.title}`,
      HTMLPart: adminEmailHTML
    });

    successResponse(res, updatedUser, 'User enrolled successfully');
  } catch (error) {
    errorResponse(res, error.message, 500, error);
  }
});

// Get specific course
CoursesRoutes.get('/:id', async (req, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        chapters: {
          orderBy: { position: 'asc' },
        },
        category: true,
        course_tags: {
          include: {
            tag: true
          }
        }
      }
    });

    if (!course) {
      return errorResponse(res, 'Course not found', 404);
    }

    successResponse(res, course, 'Course and chapters retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve course and chapters', 500, error);
  }
});

// Get chapter content
CoursesRoutes.get('/:courseId/chapters/:chapterId', authMiddleware, async (req, res) => {
  try {
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: parseInt(req.params.chapterId),
        course_id: parseInt(req.params.courseId)
      }
    });

    if (!chapter) {
      return errorResponse(res, 'Chapter not found', 404);
    }

    successResponse(res, chapter.content, 'Chapter content retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve chapter content', 500, error);
  }
});

// Update user progress
// Get user progress for a specific course
CoursesRoutes.get('/:courseId/progress', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const courseId = parseInt(req.params.courseId);

  try {
    // Get total chapters count
    const totalChapters = await prisma.chapter.count({
      where: {
        course_id: courseId
      }
    });

    // Try to find existing progress
    let progress;
    try {
      progress = await prisma.userProgress.findFirst({
        where: {
          AND: [
            { user_id: userId },
            { course_id: courseId }
          ]
        }
      });
    } catch (progressError) {
      console.error('Error finding progress:', progressError);
      // Si pas de progression trouvée, on continue avec progress = null
    }

    // Si aucune progression n'existe, créer une progression par défaut
    if (!progress) {
      return successResponse(
        res,
        {
          current_chapter_id: 1,
          completed_chapters: [],
          total_chapters: totalChapters,
          percentage: 0
        },
        'Default progress retrieved'
      );
    }

    // Calculer le pourcentage de progression
    const progressData = {
      current_chapter_id: progress.current_chapter_id,
      completed_chapters: progress.completed_chapters || [],
      total_chapters: totalChapters,
      percentage: totalChapters > 0
        ? Math.round(((progress.completed_chapters || []).length / totalChapters) * 100)
        : 0
    };

    return successResponse(res, progressData, 'User progress retrieved successfully');

  } catch (error) {
    console.error('Main error in progress retrieval:', error);
    return errorResponse(res, 'Failed to retrieve user progress', 500, error);
  }
});

// Validate chapter
CoursesRoutes.post('/:courseId/validate-chapter', authMiddleware, mentorAdminMiddleware, async (req, res) => {
  const { chapterId, score, studentId } = req.body;
  const courseId = parseInt(req.params.courseId);

  if (score < 80) {
    return errorResponse(res, 'Score is below 80%, chapter not validated', 400);
  }

  try {
    const progress = await prisma.userProgress.upsert({
      where: {
        user_id_course_id: {
          user_id: parseInt(studentId),
          course_id: courseId
        }
      },
      update: {
        current_chapter_id: parseInt(chapterId),
        completed_chapters: {
          push: parseInt(chapterId)
        }
      },
      create: {
        user_id: parseInt(studentId),
        course_id: courseId,
        current_chapter_id: parseInt(chapterId),
        completed_chapters: [parseInt(chapterId)]
      }
    });

    successResponse(res, progress, 'Chapter validated and progress updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to validate chapter and update progress', 500, error);
  }
});

// Submit work link
CoursesRoutes.post('/:courseId/chapters/:chapterId/submit-link', authMiddleware, async (req, res) => {
  const { courseId, chapterId } = req.params;
  const { link } = req.body;
  const userId = req.userId;

  try {
    const submission = await prisma.submission.create({
      data: {
        user_id: userId,
        course_id: parseInt(courseId),
        chapter_id: parseInt(chapterId),
        link,
        status: 'PENDING'
      }
    });

    successResponse(res, submission, 'Submission created successfully');
  } catch (error) {
    errorResponse(res, 'Failed to create submission', 500, error);
  }
});

// Update submission
CoursesRoutes.put('/submissions/:submissionId', authMiddleware, async (req, res) => {
  const { submissionId } = req.params;
  const { link } = req.body;
  const userId = req.userId;

  try {
    const submission = await prisma.submission.updateMany({
      where: {
        id: parseInt(submissionId),
        user_id: userId
      },
      data: {
        link,
        status: 'PENDING',
        updated_at: new Date()
      }
    });

    if (submission.count === 0) {
      return errorResponse(res, 'Submission not found or you do not have permission to update it', 404);
    }

    const updatedSubmission = await prisma.submission.findUnique({
      where: { id: parseInt(submissionId) }
    });

    successResponse(res, updatedSubmission, 'Submission updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update submission', 500, error);
  }
});

// Update course
CoursesRoutes.put('/:courseId', authMiddleware, AdminMiddleware, upload.single('coverImage'), async (req, res) => {
  const { courseId } = req.params;
  const { title, description, price, category_id, duration, tags } = req.body;

  try {
    let updateData = {
      title,
      description,
      price: parseFloat(price),
      category_id: parseInt(category_id),
      duration
    };

    if (req.file) {
      updateData.cover_image_url = await uploadToCloudinary(req.file.path);
    }

    // Mise à jour du cours
    const updatedCourse = await prisma.course.update({
      where: { id: parseInt(courseId) },
      data: updateData
    });

    // Mise à jour des tags si nécessaire
    if (tags) {
      const tagArray = JSON.parse(tags);

      // Supprimer les anciens tags
      await prisma.courseTag.deleteMany({
        where: { course_id: parseInt(courseId) }
      });

      // Ajouter les nouveaux tags
      if (tagArray.length > 0) {
        await prisma.courseTag.createMany({
          data: tagArray.map(tagId => ({
            course_id: parseInt(courseId),
            tag_id: parseInt(tagId)
          }))
        });
      }
    }

    // Récupérer le cours mis à jour avec toutes ses relations
    const finalCourse = await prisma.course.findUnique({
      where: { id: parseInt(courseId) },
      include: {
        category: true,
        course_tags: {
          include: {
            tag: true
          }
        }
      }
    });

    successResponse(res, finalCourse, 'Course updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update course', 500, error);
  }
});

// Delete course
CoursesRoutes.delete('/:courseId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId } = req.params;
  try {
    // Prisma va automatiquement supprimer les relations grâce aux relations onDelete: Cascade
    await prisma.course.delete({
      where: { id: parseInt(courseId) }
    });

    successResponse(res, { id: courseId }, 'Course deleted successfully');
  } catch (error) {
    errorResponse(res, 'Failed to delete course', 500, error);
  }
});

// Get progress for all enrolled courses
CoursesRoutes.get('/enrolled/progress/:userId', authMiddleware, async (req, res) => {
  const userId = parseInt(req.params.userId);

  try {
    // Récupérer l'utilisateur et ses cours inscrits
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { enrolled_courses: true }
    });

    if (!user || !user.enrolled_courses.length) {
      return successResponse(res, [], 'User has no enrolled courses');
    }

    // Récupérer la progression pour tous les cours inscrits
    const progress = await prisma.userProgress.findMany({
      where: {
        user_id: userId,
        course_id: {
          in: user.enrolled_courses
        }
      }
    });

    // Récupérer les informations des cours
    const courses = await prisma.course.findMany({
      where: {
        id: {
          in: user.enrolled_courses
        }
      },
      include: {
        chapters: {
          select: {
            id: true
          }
        }
      }
    });

    // Calculer le pourcentage de progression pour chaque cours
    const progressWithPercentage = progress.map(p => {
      const course = courses.find(c => c.id === p.course_id);
      const totalChapters = course?.chapters.length || 0;
      const completedChapters = p.completed_chapters ? p.completed_chapters.length : 0;
      const percentage = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

      return {
        courseId: p.course_id,
        currentChapterId: p.current_chapter_id,
        completed_chapters: p.completed_chapters,
        totalChapters,
        percentage,
        courseName: course?.title
      };
    });

    successResponse(res, progressWithPercentage, 'Course progress retrieved successfully');
  } catch (error) {
    console.error(error);
    errorResponse(res, 'Failed to retrieve course progress', 500, error);
  }
});

// Route pour ajouter un chapitre
CoursesRoutes.post('/:courseId/chapters', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId } = req.params;
  const { title, content } = req.body;

  try {
    // Vérifier si le cours existe
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseId) }
    });

    if (!course) {
      return errorResponse(res, 'Course not found', 404);
    }

    // Créer le chapitre
    const newChapter = await prisma.chapter.create({
      data: {
        title,
        content,
        course: {
          connect: { id: parseInt(courseId) }
        }
      }
    });

    // Récupérer tous les chapitres du cours pour les renvoyer
    const allChapters = await prisma.chapter.findMany({
      where: {
        course_id: parseInt(courseId)
      },
      select: {
        id: true,
        title: true,
        content: true
      },
      orderBy: {
        id: 'asc'
      }
    });

    successResponse(res, allChapters, 'Chapter created successfully');
  } catch (error) {
    console.error('Error creating chapter:', error);
    errorResponse(res, 'Failed to create chapter', 500, error);
  }
});

// Get submission status for a chapter
CoursesRoutes.get('/:courseId/chapters/:chapterId/submission-status', authMiddleware, async (req, res) => {
  const { courseId, chapterId } = req.params;
  const userId = req.userId;

  try {
    const submission = await prisma.submission.findFirst({
      where: {
        user_id: userId,
        course_id: parseInt(courseId),
        chapter_id: parseInt(chapterId)
      },
      include: {
        mentor: {
          select: {
            full_name: true,
            email: true
          }
        }
      }
    });

    if (!submission) {
      return successResponse(
        res,
        { status: 'NOT_SUBMITTED' },
        'No submission found for this chapter'
      );
    }

    successResponse(res, submission, 'Submission status retrieved successfully');
  } catch (error) {
    console.error('Error retrieving submission status:', error);
    errorResponse(res, 'Failed to retrieve submission status', 500, error);
  }
});

// Update chapter
CoursesRoutes.put('/:courseId/chapters/:chapterId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { courseId, chapterId } = req.params;
  const { title, content } = req.body;

  try {
    // Vérifier que le chapitre appartient bien au cours
    const updatedChapter = await prisma.chapter.updateMany({
      where: {
        AND: [
          { id: parseInt(chapterId) },
          { course_id: parseInt(courseId) }
        ]
      },
      data: {
        title,
        content
      }
    });

    if (updatedChapter.count === 0) {
      return errorResponse(res, 'Chapter not found or does not belong to this course', 404);
    }

    // Récupérer tous les chapitres mis à jour
    const allChapters = await prisma.chapter.findMany({
      where: {
        course_id: parseInt(courseId)
      },
      select: {
        id: true,
        title: true,
        content: true
      },
      orderBy: {
        id: 'asc'
      }
    });

    successResponse(res, allChapters, 'Chapter updated successfully');
  } catch (error) {
    console.error('Error updating chapter:', error);
    errorResponse(res, 'Failed to update chapter', 500, error);
  }
});

// Update user progress
CoursesRoutes.post('/:courseId/progress', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const courseId = parseInt(req.params.courseId);
  const { chapterId, isCompleted } = req.body;

  try {
    // Vérifier si le chapitre existe dans le cours
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: parseInt(chapterId),
        course_id: courseId
      }
    });

    if (!chapter) {
      return errorResponse(res, 'Chapter not found', 404);
    }

    // Récupérer ou créer la progression
    let progress = await prisma.userProgress.findFirst({
      where: {
        user_id: userId,
        course_id: courseId
      }
    });

    if (!progress) {
      progress = await prisma.userProgress.create({
        data: {
          user_id: userId,
          course_id: courseId,
          current_chapter_id: parseInt(chapterId),
          completed_chapters: isCompleted ? [parseInt(chapterId)] : []
        }
      });
    } else {
      // Mettre à jour la progression existante
      let newCompletedChapters = [...(progress.completed_chapters || [])];

      if (isCompleted && !newCompletedChapters.includes(parseInt(chapterId))) {
        newCompletedChapters.push(parseInt(chapterId));
      }

      progress = await prisma.userProgress.update({
        where: {
          id: progress.id
        },
        data: {
          current_chapter_id: parseInt(chapterId),
          completed_chapters: newCompletedChapters
        }
      });
    }

    // Calculer le pourcentage de progression
    const totalChapters = await prisma.chapter.count({
      where: {
        course_id: courseId
      }
    });

    const progressData = {
      current_chapter_id: progress.current_chapter_id,
      completed_chapters: progress.completed_chapters || [],
      total_chapters: totalChapters,
      percentage: totalChapters > 0
        ? Math.round(((progress.completed_chapters || []).length / totalChapters) * 100)
        : 0
    };

    successResponse(res, progressData, 'Progress updated successfully');
  } catch (error) {
    console.error('Error updating progress:', error);
    errorResponse(res, 'Failed to update progress', 500, error);
  }
});

export default CoursesRoutes;