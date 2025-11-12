import { Router } from 'express';
import {
  getModelWeights,
  resetModelWeights
} from '../controllers/modelController.js';

export const modelRouter = Router();

modelRouter.get('/', getModelWeights);
modelRouter.post('/reset', resetModelWeights);

