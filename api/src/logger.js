const log4js = require('log4js');

log4js.configure({
  appenders: {
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%m',
      },
    },
  },
  categories: {
    default: { appenders: ['console'], level: 'info' },
  },
});

const logger = log4js.getLogger();

function logUserActivity({ userId, action, ip }) {
  const entry = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    ip,
  };
  logger.info(JSON.stringify(entry));
}

module.exports = { logger, logUserActivity };
