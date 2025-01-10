export const emailHTMLTemlate = (args) => {
    const { course, courseId, user, REACT_APP_URL } = args;

    const chaptersList = course.chapters.map(chapter => `<li style="margin-bottom: 10px;">${chapter.title}</li>`).join('');
    const emailHtml = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #FFF5E6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #FFFFFF; border-radius: 10px; }
            h1, h2 { color: #FF8C00; }
            .button { background-color: #FF8C00; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
            .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="https://rzpx.mjt.lu/img2/rzpx/2878818d-3d3a-4e89-9fc1-eb15fd4c8f64/content" alt="AI Boost Logo" style="width: 100%; max-width: 300px; display: block; margin: 0 auto 20px;">
            <h1>Bienvenue dans le cours : ${course.title}</h1>
            <p>Bonjour ${user.full_name},</p>
            <p>Nous sommes ravis de vous accueillir dans le cours "${course.title}". Voici un aperçu de ce que vous allez apprendre :</p>
            <h2>Description du cours</h2>
            <p>${course.description}</p>
            <h2>Chapitres du cours</h2>
            <ul>
              ${chaptersList}
            </ul>
            <p>Pour commencer votre apprentissage, cliquez sur le bouton ci-dessous :</p>
            <p style="text-align: center;">
              <a href="${REACT_APP_URL}/course/${courseId}" class="button">Accéder au cours</a>
            </p>
            <p>Nous vous souhaitons une excellente formation !</p>
            <p>L'équipe AI Boost</p>
            <div class="footer">
              <p>Besoin d'aide ? Contactez-nous :</p>
              <p>
                <a href="https://wa.me/+22967153974" style="color: #FF8C00;">WhatsApp</a> |
                <a href="mailto:birotori@gmail.com" style="color: #FF8C00;">contact@aiboost.com</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    return emailHtml;
};


export const AdminEmailContent = ({user, course, email}) => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h1 { color: #4A90E2; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .footer { margin-top: 20px; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Nouvelle Inscription à un Cours</h1>
          <p>Un nouvel utilisateur s'est inscrit à un cours sur la plateforme AI Boost.</p>
          <table>
            <tr>
              <th>Détails</th>
              <th>Information</th>
            </tr>
            <tr>
              <td>Nom de l'utilisateur</td>
              <td>${user.full_name}</td>
            </tr>
            <tr>
              <td>Email de l'utilisateur</td>
              <td>${email}</td>
            </tr>
            <tr>
              <td>Titre du cours</td>
              <td>${course.title}</td>
            </tr>
            <tr>
              <td>ID du cours</td>
              <td>${course.id}</td>
            </tr>
            <tr>
              <td>Date d'inscription</td>
              <td>${new Date().toLocaleString()}</td>
            </tr>
          </table>
          <p>Nombre total d'inscrits à ce cours : ${course.enrolled_count}</p>
          <div class="footer">
            <p>Cet e-mail est généré automatiquement. Merci de ne pas y répondre.</p>
          </div>
        </div>
      </body>
    </html>
  `;

};

export const generateSurveyEmailHTML = ({ email, learning_goal, motivation, skill_level, usage_goal, value_range }) => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h1 { color: #FF8C00; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f8f9fa; color: #FF8C00; }
          .footer { margin-top: 20px; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Nouveau Sondage de Formation</h1>
          <p>Un nouveau sondage a été soumis sur la plateforme AI Boost.</p>
          
          <table>
            <tr>
              <th>Information</th>
              <th>Réponse</th>
            </tr>
            <tr>
              <td>Email</td>
              <td>${email}</td>
            </tr>
            <tr>
              <td>Domaine d'intérêt</td>
              <td>${learning_goal}</td>
            </tr>
            <tr>
              <td>Motivation</td>
              <td>${motivation}</td>
            </tr>
            <tr>
              <td>Niveau actuel</td>
              <td>${skill_level}</td>
            </tr>
            <tr>
              <td>Objectif d'utilisation</td>
              <td>${usage_goal}</td>
            </tr>
            <tr>
              <td>Besoin d'un mentor</td>
              <td>${value_range}</td>
            </tr>
          </table>

          <div class="footer">
            <p>Ce sondage a été soumis le ${new Date().toLocaleString()}</p>
            <p>Plateforme AI Boost - Système de Formation</p>
          </div>
        </div>
      </body>
    </html>
  `;
};