import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { pino } from 'pino';
import { env } from '../config/env.js';
import { runtimeConfig } from '../config/runtimeConfig.js';

const logger = pino({ name: 'mongo' });

let isConnected = false;
let memoryServer: MongoMemoryServer | null = null;

export async function connectMongo(): Promise<void> {
  if (isConnected) return;
  let targetUri = env.mongoUri;
  mongoose.set('strictQuery', false);
  try {
    if (!targetUri) {
      memoryServer = await MongoMemoryServer.create();
      targetUri = memoryServer.getUri();
      logger.warn('MONGO_URI not provided, using in-memory MongoDB instance');
    }

    await mongoose.connect(targetUri, {
      autoIndex: env.nodeEnv !== 'production'
    });

    runtimeConfig.mongoUri = targetUri;
    env.mongoUri = targetUri;
    isConnected = true;
    logger.info('Connected to MongoDB');
  } catch (error) {
    if (!memoryServer) {
      memoryServer = await MongoMemoryServer.create();
      targetUri = memoryServer.getUri();
      logger.error({ err: error }, 'Failed to connect to MongoDB, falling back to in-memory instance');
      await mongoose.connect(targetUri, {
        autoIndex: env.nodeEnv !== 'production'
      });
      runtimeConfig.mongoUri = targetUri;
      env.mongoUri = targetUri;
      isConnected = true;
      logger.info('Connected to in-memory MongoDB');
      return;
    }
    logger.error({ err: error }, 'Failed to connect to in-memory MongoDB');
    throw error;
  }
}

export async function disconnectMongo(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('Disconnected from MongoDB');
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
    logger.info('Stopped in-memory MongoDB');
  }
}

