import type { ErrorRequestHandler } from 'express';
import { pino } from 'pino';

const logger = pino({ name: 'api' });

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  const status = err.status ?? 500;
  res.status(status).json({
    error: err.message ?? 'Internal Server Error'
  });
};

