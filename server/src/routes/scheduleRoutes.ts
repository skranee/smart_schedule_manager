import { Router } from 'express';
import {
  calculateScheduleHandler,
  submitFeedback,
  applyEdits
} from '../controllers/scheduleController.js';

export const scheduleRouter = Router();

scheduleRouter.post('/calculate', calculateScheduleHandler);
scheduleRouter.post('/feedback', submitFeedback);
scheduleRouter.post('/apply-edits', applyEdits);

