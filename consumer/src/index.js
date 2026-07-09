const { Kafka } = require('kafkajs');
const { logDbChange, logger } = require('./logger');

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'sre-cdc-consumer';
const TOPIC_PATTERN = process.env.KAFKA_TOPIC_PATTERN || 'mysql.sre_db.';

const kafka = new Kafka({
  clientId: 'sre-cdc-consumer',
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 3000,
    retries: 30,
  },
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

function mapOperation(op) {
  switch (op) {
    case 'c':
      return 'insert';
    case 'u':
      return 'update';
    case 'd':
      return 'delete';
    case 'r':
      return 'read';
    default:
      return op || 'unknown';
  }
}

function formatChange(message) {
  if (!message.value) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(message.value.toString());
  } catch {
    return {
      timestamp: new Date().toISOString(),
      action: 'parse_error',
      topic: message.topic,
      raw: message.value.toString(),
    };
  }

  const change = payload.payload || payload;
  const source = change.source || {};
  const operation = mapOperation(change.op);

  return {
    timestamp: change.ts_ms
      ? new Date(change.ts_ms).toISOString()
      : new Date().toISOString(),
    action: operation,
    database: source.db || null,
    table: source.table || null,
    topic: message.topic,
    before: change.before || null,
    after: change.after || null,
  };
}

async function waitForKafka(retries = 40, delayMs = 3000) {
  const admin = kafka.admin();
  for (let i = 1; i <= retries; i++) {
    try {
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();
      logger.info(JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'kafka_connected',
        brokers: KAFKA_BROKERS,
      }));
      return;
    } catch (err) {
      logger.info(JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'waiting_for_kafka',
        attempt: i,
        maxAttempts: retries,
        error: err.message,
      }));
      try {
        await admin.disconnect();
      } catch (_) {
        // ignore
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Could not connect to Kafka');
}

async function start() {
  await waitForKafka();
  await consumer.connect();

  await consumer.subscribe({
    topic: new RegExp(`^${TOPIC_PATTERN.replace(/\./g, '\\.')}.*`),
    fromBeginning: true,
  });

  logger.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    action: 'consumer_started',
    topicPattern: TOPIC_PATTERN,
  }));

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const entry = formatChange({ topic, value: message.value });
      if (!entry) {
        return;
      }
      // Skip snapshot/read noise if desired; still log schema changes meaningfully
      if (entry.action === 'read') {
        return;
      }
      logDbChange(entry);
    },
  });
}

start().catch((err) => {
  logger.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    action: 'consumer_failed',
    error: err.message,
  }));
  process.exit(1);
});
