import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import rateLimit from 'express-rate-limit';
import passport from './config/passport.js';
import { apiRouter } from './routes/index.js';
import { env, isProduction } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.baseUrl,
    credentials: true
  }),
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const mongoUri = env.mongoUri;
const sessionSecret = env.sessionSecret || 'dev-secret';

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: mongoUri
      ? MongoStore.create({
          mongoUrl: mongoUri,
          ttl: 60 * 60 * 24
        })
      : new session.MemoryStore(),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }),
);

app.use(passport.initialize());
app.use(passport.session());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', limiter, apiRouter);

app.use(errorHandler);

export default app;

