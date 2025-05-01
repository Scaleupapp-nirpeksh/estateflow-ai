const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure logs directory exists
const logDir = config.logging.dir;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level}]: ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
    }`;
  })
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: config.nodeEnv === 'development' ? 'debug' : 'info',
    format: consoleFormat,
  }),
];

// Add file transports in production
if (config.nodeEnv === 'production') {
  transports.push(
    // Write logs to files in production
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      level: config.logging.level,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: config.name },
  transports,
  exitOnError: false,
});

// Stream for Morgan HTTP request logger
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

module.exports = logger;