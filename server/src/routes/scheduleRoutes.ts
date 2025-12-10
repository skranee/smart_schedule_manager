import { Router } from 'express';
import {
  calculateScheduleHandler,
  getPlanHandler,
  submitFeedback,
  applyEdits
} from '../controllers/scheduleController.js';

export const scheduleRouter = Router();

scheduleRouter.get('/plan', getPlanHandler);
scheduleRouter.post('/calculate', calculateScheduleHandler);
scheduleRouter.post('/feedback', submitFeedback);
scheduleRouter.post('/apply-edits', applyEdits);

