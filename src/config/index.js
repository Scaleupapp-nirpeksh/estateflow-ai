const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

// Set default environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const config = {
  // Application
  nodeEnv: process.env.NODE_ENV,
  name: process.env.APP_NAME || 'EstateFlowAI',
  version: require('../../package.json').version,
  port: parseInt(process.env.PORT, 10) || 3000,
  apiVersion: process.env.API_VERSION || 'v1',
  
  // MongoDB configuration
  mongodb: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/estateflow-ai',
    dbName: process.env.MONGO_DB_NAME || 'estateflow-ai',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  // JWT Authentication
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpirationMinutes: process.env.JWT_ACCESS_EXPIRATION || '1h',
    refreshExpirationDays: process.env.JWT_REFRESH_EXPIRATION || '7d',
    resetPasswordExpirationMinutes: 10,
  },
  
  // LLM Integration
  llm: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    maxTokens: 1000,
    temperature: 0.7,
  },
  
  // AWS S3 configuration for document storage
  aws: {
    region: process.env.AWS_REGION,
    bucketName: process.env.AWS_BUCKET_NAME,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: path.resolve(__dirname, '../../logs'),
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
};

// Environment validation
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['JWT_SECRET', 'MONGO_URI', 'OPENAI_API_KEY'];
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = config;