import { Router } from 'express';
import { authRouter } from './authRoutes.js';
import { taskRouter } from './taskRoutes.js';
import { catalogRouter } from './catalogRoutes.js';
import { scheduleRouter } from './scheduleRoutes.js';
import { settingsRouter } from './settingsRoutes.js';
import { modelRouter } from './modelRoutes.js';
import { ensureAuthenticated } from '../middleware/authGuard.js';
import { getCurrentUser } from '../controllers/userController.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.get('/me', ensureAuthenticated, getCurrentUser);
apiRouter.use('/tasks', ensureAuthenticated, taskRouter);
apiRouter.use('/catalog', ensureAuthenticated, catalogRouter);
apiRouter.use('/schedule', ensureAuthenticated, scheduleRouter);
apiRouter.use('/settings', ensureAuthenticated, settingsRouter);
apiRouter.use('/model', ensureAuthenticated, modelRouter);

