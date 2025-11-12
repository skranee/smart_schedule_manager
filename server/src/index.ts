import { pino } from 'pino';
import app from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './db/connection.js';

const logger = pino({ name: 'server' });

async function start() {
  try {
    await connectMongo();
    app.listen(env.port, () => {
      logger.info(`Server listening on ${env.port}`);
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

start();

