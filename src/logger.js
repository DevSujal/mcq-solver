import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Human-friendly log helpers
function prefix(reqId) {
  return reqId ? `REQ#${reqId} | ` : '';
}

export function infoShort(reqId, stage, message, extra = {}) {
  const msg = `${prefix(reqId)}${stage} - ${message}`;
  logger.info({ reqId, stage, ...extra }, msg);
}

export function warnShort(reqId, stage, message, extra = {}) {
  const msg = `${prefix(reqId)}${stage} - ${message}`;
  logger.warn({ reqId, stage, ...extra }, msg);
}

export function errorShort(reqId, stage, message, extra = {}) {
  const msg = `${prefix(reqId)}${stage} - ${message}`;
  logger.error({ reqId, stage, ...extra }, msg);
}

export function debugShort(reqId, stage, message, extra = {}) {
  const msg = `${prefix(reqId)}${stage} - ${message}`;
  logger.debug({ reqId, stage, ...extra }, msg);
}
