const winston = require('winston');
const { trace } = require('@opentelemetry/api');

// Simplified trace format that works better with OTel instrumentation
const traceFormat = winston.format((info) => {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    info.traceId = spanContext.traceId;
    info.spanId = spanContext.spanId;
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    traceFormat(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'ecommerce-app',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Keep console transport for local debugging
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, traceId, spanId, ...meta }) => {
          const traceInfo = traceId ? ` [trace=${traceId.slice(-8)} span=${spanId?.slice(-8)}]` : '';
          return `${timestamp} ${level}${traceInfo}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    })
  ]
});

module.exports = logger;