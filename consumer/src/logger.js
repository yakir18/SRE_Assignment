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

function logDbChange(entry) {
  logger.info(JSON.stringify(entry));
}

module.exports = { logger, logDbChange };
