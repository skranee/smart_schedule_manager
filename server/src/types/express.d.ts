import type { UserDocument } from '../models/User.js';

declare global {
  namespace Express {
    interface User extends UserDocument {}
  }
}

declare module 'express-session' {
  interface SessionData {
    redirectAfterLogin?: string;
  }
}

export {};

