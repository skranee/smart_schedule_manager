import { Router } from 'express';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask
} from '../controllers/tasksController.js';

export const taskRouter = Router();

taskRouter.get('/', listTasks);
taskRouter.post('/', createTask);
taskRouter.put('/:id', updateTask);
taskRouter.delete('/:id', deleteTask);

