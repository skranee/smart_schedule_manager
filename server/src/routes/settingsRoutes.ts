import { Router } from 'express';
import { updateSettings } from '../controllers/settingsController.js';
import { getCurrentUser } from '../controllers/userController.js';

export const settingsRouter = Router();

settingsRouter.get('/me', getCurrentUser);
settingsRouter.put('/', updateSettings);

