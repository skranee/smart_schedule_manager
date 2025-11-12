import { Router } from 'express';
import {
  listCatalog,
  createCatalogEntry
} from '../controllers/catalogController.js';

export const catalogRouter = Router();

catalogRouter.get('/', listCatalog);
catalogRouter.post('/', createCatalogEntry);

