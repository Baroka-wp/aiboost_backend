import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/utils.js';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import { authMiddleware, AdminMiddleware, mentorAdminMiddleware } from '../utils/utils.js';

config();

const prisma = new PrismaClient();
const AdminRoutes = Router();

// Get all users
AdminRoutes.get('/users', authMiddleware, AdminMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        full_name: true,
        role: true
      },
      orderBy: {
        id: 'asc'
      }
    });

    successResponse(res, users, 'Users retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve users', 500, error);
  }
});

// Create user
AdminRoutes.post('/users', authMiddleware, AdminMiddleware, async (req, res) => {
  const { email, password, username, full_name, role } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
        full_name,
        role
      },
      select: {
        email: true,
        username: true,
        full_name: true,
        role: true
      }
    });

    successResponse(res, { user: newUser }, "User registered successfully", 201);
  } catch (error) {
    errorResponse(res, 'Failed to create user', 500, error);
  }
});

// Get mentor submissions
AdminRoutes.get('/mentor/submissions', authMiddleware, mentorAdminMiddleware, async (req, res) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: {
        status: {
          in: ['PENDING', 'NEEDS_REVISION']
        }
      },
      include: {
        user: {
          select: {
            full_name: true,
            email: true
          }
        },
        course: {
          select: {
            title: true
          }
        },
        chapter: {
          select: {
            title: true,
            content: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    successResponse(res, submissions, 'Submissions retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve submissions', 500, error);
  }
});

// Update submission
AdminRoutes.put('/mentor/submissions/:submissionId', authMiddleware, mentorAdminMiddleware, async (req, res) => {
  const { submissionId } = req.params;
  const { status, mentor_comment } = req.body;
  
  try {
    const updatedSubmission = await prisma.submission.update({
      where: {
        id: parseInt(submissionId)
      },
      data: {
        status,
        mentor_comment
      }
    });
    
    successResponse(res, updatedSubmission, 'Submission updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update submission', 500, error);
  }
});

// Update user
AdminRoutes.put('/users/:userId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { email, full_name, username, role, password } = req.body;

  try {
    let updateData = { email, full_name, role, username };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: parseInt(userId)
      },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        full_name: true,
        role: true
      }
    });

    successResponse(res, updatedUser, 'User updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update user', 500, error);
  }
});

// Delete user
AdminRoutes.delete('/users/:userId', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const deletedUser = await prisma.user.delete({
      where: {
        id: parseInt(userId)
      }
    });

    successResponse(res, deletedUser, 'User deleted successfully');
  } catch (error) {
    errorResponse(res, 'Failed to delete user', 500, error);
  }
});

// Suspend/reactivate user
AdminRoutes.put('/users/:userId/suspend', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { is_suspended } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: {
        id: parseInt(userId)
      },
      data: {
        is_suspended
      }
    });

    successResponse(res, updatedUser, `User ${is_suspended ? 'suspended' : 'reactivated'} successfully`);
  } catch (error) {
    errorResponse(res, 'Failed to update user suspension status', 500, error);
  }
});

// Enroll user in course
AdminRoutes.post('/users/:userId/enroll', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { course_id } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    });

    const enrolledCourses = user.enrolled_courses || [];
    if (!enrolledCourses.includes(course_id)) {
      const updatedUser = await prisma.user.update({
        where: { id: parseInt(userId) },
        data: {
          enrolled_courses: {
            push: course_id
          }
        }
      });

      successResponse(res, updatedUser, 'User enrolled in course successfully');
    } else {
      successResponse(res, null, 'User already enrolled in this course');
    }
  } catch (error) {
    errorResponse(res, 'Failed to enroll user in course', 500, error);
  }
});

// Get user progress
AdminRoutes.get('/users/:userId/progress', authMiddleware, AdminMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: {
        progress: {
          include: {
            course: {
              include: {
                chapters: true
              }
            }
          }
        }
      }
    });

    const progressWithDetails = user.progress.map(p => ({
      course_id: p.course_id,
      course_title: p.course.title,
      total_chapters: p.course.chapters.length,
      completed_chapters: p.completed_chapters,
      percentage: Math.round((p.completed_chapters.length / p.course.chapters.length) * 100)
    }));

    successResponse(res, progressWithDetails, 'User progress retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user progress', 500, error);
  }
});

// Get mentors with pagination
AdminRoutes.get('/mentors', authMiddleware, AdminMiddleware, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const [mentors, count] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: 'MENTOR'
        },
        select: {
          id: true,
          email: true,
          username: true,
          full_name: true,
          role: true,
          is_suspended: true
        },
        skip,
        take: parseInt(limit),
        orderBy: {
          id: 'asc'
        }
      }),
      prisma.user.count({
        where: {
          role: 'MENTOR'
        }
      })
    ]);

    const totalPages = Math.ceil(count / parseInt(limit));

    successResponse(
      res, 
      { mentors, totalPages, currentPage: parseInt(page) }, 
      'Mentors retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve mentors', 500, error);
  }
});

// Get students with pagination and course progress
AdminRoutes.get('/students', authMiddleware, AdminMiddleware, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const [students, count] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: 'USER'
        },
        include: {
          progress: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  chapters: {
                    select: {
                      id: true
                    }
                  }
                }
              }
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: {
          id: 'asc'
        }
      }),
      prisma.user.count({
        where: {
          role: 'USER'
        }
      })
    ]);

    const studentsWithCourseInfo = students.map(student => ({
      ...student,
      courses: student.progress.map(p => ({
        id: p.course.id,
        title: p.course.title,
        progress: Math.round((p.completed_chapters.length / p.course.chapters.length) * 100)
      }))
    }));

    const totalPages = Math.ceil(count / parseInt(limit));

    successResponse(
      res,
      { students: studentsWithCourseInfo, totalPages, currentPage: parseInt(page) },
      'Students retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve students', 500, error);
  }
});

export default AdminRoutes;