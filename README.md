# AIBoost Backend

This is the backend server for the AIBoost learning platform, built with Express.js and using Supabase as the database.
AIBoost is a comprehensive online learning platform focused on AI and productivity enhancement. This project consists of a React-based frontend and an Express.js backend, providing a full-featured educational experience.

## Technologies Used

- Node.js
- Express.js
- Supabase
- JSON Web Tokens (JWT) for authentication
- bcrypt for password hashing

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   JWT_SECRET=your_jwt_secret
   ```

3. Start the server:
   ```
   npm start
   ```

The server will start on `http://localhost:5345` by default.

## API Routes

### Authentication
- POST `/auth/register`: Register a new user
- POST `/auth/login`: Log in a user
- GET `/auth/users/:id`: Get user profile (protected)

### Courses
- GET `/courses`: Get all courses
- GET `/courses/enrolled`: Get enrolled courses for a user (protected)
- POST `/courses/enroll/:courseId`: Enroll in a course (protected)
- GET `/courses/:id`: Get a specific course with chapters
- POST `/courses/:courseId/progress`: Update user progress (protected)
- POST `/courses/:courseId/validate-chapter`: Validate a chapter (protected, mentor/admin only)
- GET `/courses/:courseId/progress`: Get user progress for a course (protected)
- POST `/courses/:courseId/chapters/:chapterId/submit-link`: Submit work link (protected)
- PUT `/courses/submissions/:submissionId`: Update a submission (protected)

### Admin
- GET `/admin/users`: Get all users (admin only)
- POST `/admin/users`: Create a new user (admin only)
- GET `/admin/mentor/submissions`: Get all pending submissions (mentor/admin only)
- PUT `/admin/mentor/submissions/:submissionId`: Update a submission status (mentor/admin only)

## Database Schema

The backend uses Supabase with the following main tables:
- `users`: User information and authentication
- `courses`: Course details
- `chapters`: Course chapters
- `user_progress`: User progress in courses
- `submissions`: User work submissions

## Error Handling

The backend uses custom error handling middleware. All errors are logged and appropriate error responses are sent to the client.

## Authentication and Authorization

JWT is used for authentication. The `authMiddleware` checks for a valid token in the request header. Additional middleware (`AdminMiddleware` and `mentorAdminMiddleware`) is used for role-based access control.

## Contributing

Please read the main README for contribution guidelines.