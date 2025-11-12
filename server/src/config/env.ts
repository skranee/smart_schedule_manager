import { config as loadEnv } from 'dotenv';

loadEnv();

function normalizeUrl(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  try {
    const url = new URL(value && value.length > 0 ? value : fallback);
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback.replace(/\/$/, '');
  }
}

function normalizeApiUrl(raw: string | undefined, fallback: string): string {
  const base = normalizeUrl(raw, fallback);
  try {
    const url = new URL(base);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/api';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback.replace(/\/$/, '');
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGO_URI ?? '',
  sessionSecret: process.env.SESSION_SECRET?.trim() ?? 'dev-session-secret',
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
  baseUrl: normalizeUrl(process.env.BASE_URL, 'http://localhost:5173'),
  apiUrl: normalizeApiUrl(process.env.API_URL, 'http://localhost:3000/api'),
  huggingFaceApiKey: process.env.HF_API_KEY,
  huggingFaceEndpoint: process.env.HF_ENDPOINT ?? 'https://api-inference.huggingface.co',
  devGoogleEmail: process.env.DEV_GOOGLE_EMAIL?.trim() ?? 'developer@example.com'
};

export function assertEnv() {
  const required = [
    ['MONGO_URI', env.mongoUri],
    ['SESSION_SECRET', env.sessionSecret]
  ] as const;

  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export const isProduction = env.nodeEnv === 'production';

