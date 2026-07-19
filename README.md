# SRE Assignment

Full-stack login application with authentication, MySQL, Debezium CDC, Apache Kafka, Docker, and structured logging (`log4js`).

The entire stack starts with a single command:

```bash
docker compose up --build
```

Then open: [http://localhost:8080](http://localhost:8080)

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `password123` |

---

## Assignment coverage

### Part 1 — Development

| Requirement | Implementation |
|-------------|----------------|
| Backend Node.js + REST API | `api/` — Express.js |
| Frontend React or basic HTML | `client/` — basic HTML login page |
| MySQL database | `mysql` service + `db/init.sql` |
| Login screen with validation | Username/email + password, client + server validation |
| Auth tokens stored in DB | Table `tokens`; created on login |
| Tokens sent via HTTP headers | `Authorization: Bearer <token>` |

### Part 2 — DevOps

| Requirement | Implementation |
|-------------|----------------|
| Dockerize client + API | `client/Dockerfile`, `api/Dockerfile` |
| MySQL + Debezium in Docker | `docker-compose.yml` |
| Apache Kafka in Docker | `kafka` + `zookeeper` services |
| Auto DB schema import | `db/init.sql` mounted into MySQL |
| Auto-create default user | Seeded in `db/init.sql` |

### Part 3 — Monitoring & Logging (SRE)

| Requirement | Implementation |
|-------------|----------------|
| Log every login as JSON (`log4js`) | `api/src/logger.js` — fields: `timestamp`, `userId`, `action`, `ip` |
| CDC for insert/update/delete | Debezium MySQL connector (binlog) |
| Connector in Compose, auto-start | `connect` + `connector-init` |
| Node.js Kafka consumer | `consumer/` — prints DB changes as structured JSON |

---

## Technology stack

- **Frontend:** HTML + Nginx (reverse proxy to API)
- **Backend:** Node.js, Express.js
- **Database:** MySQL 8 (ROW binlog enabled)
- **CDC:** Debezium MySQL connector
- **Message queue:** Apache Kafka (+ Zookeeper)
- **Logging:** `log4js` (API + consumer)
- **Containers:** Docker & Docker Compose

---

## Architecture

```
Browser
   │
   ▼
client (:8080)  ──nginx proxy /api──►  api (:3000)  ──►  mysql (:3306)
                                                          │ binlog
                                                          ▼
                                              connect / Debezium (:8083)
                                                          │
                                                          ▼
                                                       kafka (:9092)
                                                          │
                                                          ▼
                                                      consumer
                                                   (logs DB changes)
```

| Service | Role | Port |
|---------|------|------|
| `client` | Login UI + reverse proxy to API | 8080 |
| `api` | REST API (login, auth, logging) | 3000 |
| `mysql` | MySQL 8 with binary logs | 3306 |
| `zookeeper` | Kafka coordination | 2181 |
| `kafka` | Message broker | 9092 |
| `connect` | Debezium Kafka Connect | 8083 |
| `connector-init` | Registers MySQL CDC connector on startup | - |
| `consumer` | Kafka consumer — logs DB changes | - |

---

## Prerequisites

- Docker Desktop
- Docker Compose v2

---

## Quick start

```bash
docker compose up --build
```

First startup may take 1–2 minutes (image pulls + MySQL/Kafka/Debezium readiness).

If MySQL auth fails (`Access denied for user ...`), reset the database volume and start clean:

```bash
docker compose down -v
docker compose up --build
```

### Stop / reset

```bash
# Stop containers
docker compose down

# Full reset (also deletes MySQL data volume)
docker compose down -v
```

---

## Usage

1. Open [http://localhost:8080](http://localhost:8080)  
   UI and API are served together — nginx proxies `/api` to the backend.
2. Sign in with `admin` / `password123`.
3. After login, the UI stores the token and can call `/api/me` with the `Authorization` header.

### API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check |
| `POST` | `/api/login` | No | Login; returns token + user |
| `GET` | `/api/me` | Yes | Current authenticated user |
| `POST` | `/api/logout` | Yes | Deletes token from DB |

### curl examples

```bash
# Login (via UI proxy on 8080)
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"password123\"}"

# Authenticated request (replace TOKEN)
curl http://localhost:8080/api/me \
  -H "Authorization: Bearer TOKEN"

# Logout
curl -X POST http://localhost:8080/api/logout \
  -H "Authorization: Bearer TOKEN"
```

The API is also exposed directly on port `3000` if needed.

---

## How authentication works

1. User submits username/email + password.
2. API validates input and checks the `users` table.
3. On success, a UUID token is inserted into `tokens` and returned to the client.
4. Protected routes require header: `Authorization: Bearer <token>`.
5. Middleware looks up the token in the DB (and checks expiry).
6. Logout deletes the token row.

---

## How CDC / monitoring works

1. MySQL runs with ROW binary logging.
2. On Compose startup, `connector-init` registers the Debezium MySQL connector.
3. Debezium reads binlog changes (`INSERT` / `UPDATE` / `DELETE`) for `sre_db.users` and `sre_db.tokens`.
4. Events are published to Kafka topics:
   - `mysql.sre_db.users`
   - `mysql.sre_db.tokens`
5. The Node.js `consumer` reads those topics and prints structured JSON to the console.

Example flow: a successful login inserts a row into `tokens` → Debezium captures it → Kafka → consumer logs an `insert` event.

---

## Logs to inspect

### User login activity (API / log4js)

```bash
docker compose logs -f api
```

Example:

```json
{"timestamp":"2026-07-09T14:00:00.000Z","userId":1,"action":"login","ip":"172.18.0.1"}
```

Required fields: `timestamp`, `userId`, `action`, `ip`.

### Database change events (CDC consumer / log4js)

```bash
docker compose logs -f consumer
```

Example after login (token insert):

```json
{
  "timestamp": "2026-07-09T15:05:33.127Z",
  "action": "insert",
  "database": "sre_db",
  "table": "tokens",
  "topic": "mysql.sre_db.tokens",
  "before": null,
  "after": {
    "id": 1,
    "user_id": 1,
    "token": "...",
    "created_at": "...",
    "expires_at": "..."
  }
}
```

---

## Database initialization

On first MySQL start, `db/init.sql` automatically:

- Creates database `sre_db`
- Creates tables `users` and `tokens`
- Seeds default user `admin` / `password123`
- Creates API DB user `sre_app` / `srepassword` for container-to-container access
- Creates Debezium replication user `debezium` / `dbz` with required privileges

---

## Project structure

```
.
├── api/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js           # Express routes (login/me/logout)
│       ├── db.js              # MySQL pool
│       ├── logger.js          # log4js user-activity logging
│       └── middleware/auth.js # Token header validation
├── client/
│   ├── Dockerfile
│   ├── index.html             # Login UI + validation
│   └── nginx.conf             # Serves UI + proxies /api
├── consumer/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js           # Kafka CDC consumer
│       └── logger.js          # log4js DB-change logging
├── db/
│   └── init.sql               # Schema + default user + debezium user
├── debezium/
│   └── register-connector.sh  # Auto-registers Debezium connector
├── docker-compose.yml
└── README.md
```

---

## Notes

- UI is intentionally minimal (assignment requirement).
- Client and API are separate containers, but appear as one app on port `8080` via nginx proxy.
- CDC connector registration runs automatically via `connector-init` when Compose starts.
- Tokens are persisted in MySQL and required on protected endpoints.
