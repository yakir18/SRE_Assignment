#!/bin/sh
set -e

CONNECT_URL="${CONNECT_URL:-http://connect:8083}"
CONNECTOR_NAME="${CONNECTOR_NAME:-mysql-connector}"

echo "Waiting for Kafka Connect at ${CONNECT_URL}..."
i=0
until curl -sf "${CONNECT_URL}/connectors" > /dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "Kafka Connect did not become ready in time"
    exit 1
  fi
  echo "Connect not ready yet (attempt ${i})..."
  sleep 5
done

echo "Waiting briefly for MySQL to settle..."
sleep 15

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${CONNECT_URL}/connectors/${CONNECTOR_NAME}" || true)
if [ "$HTTP_CODE" = "200" ]; then
  echo "Connector ${CONNECTOR_NAME} already exists"
  exit 0
fi

echo "Registering Debezium MySQL connector..."
curl -sf -X POST "${CONNECT_URL}/connectors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mysql-connector",
    "config": {
      "connector.class": "io.debezium.connector.mysql.MySqlConnector",
      "tasks.max": "1",
      "database.hostname": "mysql",
      "database.port": "3306",
      "database.user": "debezium",
      "database.password": "dbz",
      "database.server.id": "184054",
      "topic.prefix": "mysql",
      "database.include.list": "sre_db",
      "table.include.list": "sre_db.users,sre_db.tokens",
      "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
      "schema.history.internal.kafka.topic": "schemahistory.sre",
      "include.schema.changes": "false",
      "snapshot.mode": "initial"
    }
  }'

echo ""
echo "Debezium connector registered successfully"