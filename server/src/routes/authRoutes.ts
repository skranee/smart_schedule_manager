import { Router } from 'express';
import passport from '../config/passport.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { UserModel } from '../models/index.js';
import { buildDefaultWeights } from '@shared/features/featureExtractor.js';

export const authRouter = Router();

authRouter.get('/google', (req, res, next) => {
  const redirect = typeof req.query.redirect === 'string' ? req.query.redirect : undefined;
  if (redirect) {
    req.session.redirectAfterLogin = redirect;
  }
  const handler = passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: redirect
  });
  handler(req, res, next);
});

authRouter.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${env.baseUrl}/login?error=auth`
  }),
  (req, res) => {
    const stateRedirect = typeof req.query.state === 'string' ? req.query.state : undefined;
    const sessionRedirect = req.session.redirectAfterLogin;
    if (sessionRedirect) {
      delete req.session.redirectAfterLogin;
    }
    const redirectTarget = stateRedirect ?? sessionRedirect ?? '/';
    const url = new URL(redirectTarget, env.baseUrl);
    res.redirect(url.toString());
  },
);

authRouter.post('/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(204).send();
    });
  });
});

if (env.nodeEnv !== 'production') {
  authRouter.post(
    '/dev-login',
    asyncHandler(async (req, res, next) => {
      const emailInput = typeof req.body?.email === 'string' ? req.body.email : env.devGoogleEmail;
      const email = emailInput.trim().toLowerCase();
      const displayName = typeof req.body?.name === 'string' ? req.body.name : 'Developer Mode User';

      let user = await UserModel.findOne({ email }).exec();
      if (!user) {
        user = await UserModel.create({
          googleId: `dev-${email}`,
          email,
          name: displayName,
          locale: 'ru',
          sleepStart: '23:00',
          sleepEnd: '07:00',
          workStart: '09:00',
          workEnd: '17:00',
          preferredDailyMinutes: 8 * 60,
          model: {
            weights: buildDefaultWeights(),
            updatedAt: new Date()
          }
        });
      }

      req.logIn(user, (error) => {
        if (error) {
          next(error);
          return;
        }
        res.json({
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale
        });
      });
    }),
  );
}

