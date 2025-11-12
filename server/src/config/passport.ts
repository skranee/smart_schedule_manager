import passport from 'passport';
import { pino } from 'pino';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { buildDefaultWeights } from '@shared/features/featureExtractor.js';
import { env } from './env.js';
import { UserModel, type UserDocument } from '../models/index.js';

type VerifyCallback = (
  accessToken: string,
  refreshToken: string,
  profile: Profile,
  done: (error: Error | null, user?: Express.User | false) => void,
) => void;

const logger = pino({ name: 'auth' });

async function resolveUser(profile: Profile): Promise<UserDocument> {
  const primaryEmail = profile.emails?.[0]?.value;
  if (!primaryEmail) {
    throw new Error('Google account does not expose an email address');
  }

  const existingUser = await UserModel.findOne({ googleId: profile.id });
  if (existingUser) {
    existingUser.name = profile.displayName ?? existingUser.name;
    await existingUser.save();
    return existingUser;
  }

  return UserModel.create({
    googleId: profile.id,
    email: primaryEmail,
    name: profile.displayName,
    locale: 'ru',
    model: {
      weights: buildDefaultWeights(),
      updatedAt: new Date()
    }
  });
}

const verify: VerifyCallback = async (_accessToken, _refreshToken, profile, done) => {
  try {
    const user = await resolveUser(profile);
    return done(null, user);
  } catch (error) {
    return done(error as Error);
  }
};

const hasGoogleCredentials = Boolean(env.googleClientId && env.googleClientSecret);

if (hasGoogleCredentials) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: `${env.apiUrl}/auth/google/callback`
      },
      verify,
    ),
  );
} else {
  logger.warn('GOOGLE_CLIENT_ID/SECRET not set, enabling mock Google auth strategy');

  class DevGoogleStrategy extends (passport as any).Strategy {
    name = 'google';

    async authenticate(req: any) {
      try {
        const emailFromQuery = typeof req.query.email === 'string' ? req.query.email : undefined;
        const displayName =
          typeof req.query.name === 'string' ? req.query.name : 'Developer Mode User';
        const email = emailFromQuery ?? env.devGoogleEmail;
        const redirect =
          (typeof req.query.state === 'string' && req.query.state) ??
          req.session.redirectAfterLogin ??
          '/';

        const profile = {
          provider: 'google',
          id: `dev-google-${email}`,
          displayName,
          name: {
            familyName: displayName.split(' ').slice(-1).join(' ') || 'User',
            givenName: displayName.split(' ')[0] ?? 'Dev'
          },
          emails: [{ value: email }],
          photos: [],
          _raw: '',
          _json: { locale: 'ru' }
        } as unknown as Profile;

        const user = await resolveUser(profile);
        this.success(user);
        if (req.session.redirectAfterLogin) {
          delete req.session.redirectAfterLogin;
        }
        const target = new URL(redirect, env.baseUrl);
        this.redirect(target.toString());
      } catch (error) {
        logger.error({ err: error }, 'Mock Google authentication failed');
        this.error(error as Error);
      }
    }
  }

  passport.use(new DevGoogleStrategy());
}

passport.serializeUser((user, done) => {
  done(null, (user as UserDocument).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await UserModel.findById(id);
    if (!user) {
      return done(null, false);
    }
    return done(null, user);
  } catch (error) {
    return done(error as Error);
  }
});

export default passport;

