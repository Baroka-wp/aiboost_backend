// src/handlers/survey.js
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { successResponse, errorResponse } from '../utils/apiResponses.js';
import jwt from 'jsonwebtoken';
import { SendEmail } from '../utils/utils.js';
import { generateSurveyEmailHTML } from '../utils/mailHTML.js';

const prisma = new PrismaClient();
const SurveyRoutes = Router();

// Submit survey response
SurveyRoutes.post('/submit', async (req, res) => {
  const { 
    email,
    learning_goal,
    motivation,
    skill_level,
    usage_goal,
    value_range 
  } = req.body;

  try {
    // Récupérer l'ID utilisateur s'il existe dans le token
    const userId = req.headers.authorization ? 
      jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET)?.id :
      null;

    // Vérifier si l'email est fourni pour les utilisateurs non connectés
    if (!userId && !email) {
      return errorResponse(res, 'Email is required for non-authenticated users', 400);
    }

    // Créer la réponse au sondage
    const survey = await prisma.survey.create({
      data: {
        email: email || (await prisma.user.findUnique({ where: { id: userId } })).email,
        user_id: userId,
        learning_goal,
        motivation,
        skill_level,
        usage_goal,
        value_range
      }
    });

    // Récupérer les recommandations de cours basées sur les réponses
    const recommendations = await getCourseRecommendations({
      learning_goal,
      skill_level,
      usage_goal
    });

     // Générer et envoyer l'email de notification
     const emailHtml = generateSurveyEmailHTML({
        email: survey.email,
        learning_goal,
        motivation,
        skill_level,
        usage_goal,
        value_range
      });
  
      await SendEmail({
        mail: "birotori@gmail.com",
        name: "Baroka",
        subject: "Nouveau Sondage de Formation Soumis",
        HTMLPart: emailHtml
      });

    successResponse(res, { 
      survey,
      recommendations 
    }, 'Survey submitted successfully');
  } catch (error) {
    console.error('Survey submission error:', error);
    errorResponse(res, 'Failed to submit survey', 500, error);
  }
});

// Fonction utilitaire pour obtenir des recommandations de cours
async function getCourseRecommendations({ learning_goal, skill_level, usage_goal }) {
  try {
    const courses = await prisma.course.findMany({
      where: {
        OR: [
          { title: { contains: learning_goal, mode: 'insensitive' } },
          { description: { contains: learning_goal, mode: 'insensitive' } }
        ]
      },
      include: {
        category: true,
        chapters: {
          select: {
            id: true
          }
        }
      },
      take: 3
    });

    return courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      category: course.category.name,
      chaptersCount: course.chapters.length,
      difficulty: course.difficulty || 'intermédiaire',
      price: course.price
    }));
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [];
  }
}

export default SurveyRoutes;