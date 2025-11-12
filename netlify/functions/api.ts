import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes from copied server dist (outside functions directory)
import { userRouter } from '../.build/server-dist/routes/userRoutes.js';
import { authRouter } from '../.build/server-dist/routes/authRoutes.js';
import { tasksRouter } from '../.build/server-dist/routes/tasksRoutes.js';
import { scheduleRouter } from '../.build/server-dist/routes/scheduleRoutes.js';
import { settingsRouter } from '../.build/server-dist/routes/settingsRoutes.js';
import { catalogRouter } from '../.build/server-dist/routes/catalogRoutes.js';
import { modelRouter } from '../.build/server-dist/routes/modelRoutes.js';
import { errorHandler } from '../.build/server-dist/middleware/errorHandler.js';
import { authGuard } from '../.build/server-dist/middleware/authGuard.js';

// Configure passport
import '../.build/server-dist/config/passport.js';

const app = express();

// Trust proxy - important for Netlify
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: process.env.BASE_URL || true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration
const sessionConfig: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
};

// MongoDB connection
let isConnected = false;

async function connectDB() {
  if (isConnected) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI не задан в переменных окружения');
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log('✅ MongoDB подключен');
  } catch (error) {
    console.error('❌ Ошибка подключения к MongoDB:', error);
    throw error;
  }
}

// Use MongoDB store for sessions
if (process.env.MONGO_URI) {
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    touchAfter: 24 * 3600,
    crypto: {
      secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    },
  });
}

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRouter);
app.use('/me', authGuard, userRouter);
app.use('/tasks', authGuard, tasksRouter);
app.use('/schedule', authGuard, scheduleRouter);
app.use('/settings', authGuard, settingsRouter);
app.use('/catalog', authGuard, catalogRouter);
app.use('/model', authGuard, modelRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Wrap with serverless-http and ensure DB connection
const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  // Ensure DB is connected
  await connectDB();
  
  // Call the serverless handler
  return serverlessHandler(event, context);
};

