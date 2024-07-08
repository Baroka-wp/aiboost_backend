import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import CoursesRoutes from './src/handlers/courses.js';
import RegistrationRoutes from './src/handlers/Registration.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import AdminRoutes from './src/handlers/admin.js';

config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/courses', CoursesRoutes);
app.use('/auth', RegistrationRoutes);
app.use('/admin', AdminRoutes);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));