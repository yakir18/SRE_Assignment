CREATE DATABASE IF NOT EXISTS sre_db;
USE sre_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Default user: admin / password123
INSERT INTO users (username, email, password)
VALUES ('admin', 'admin@example.com', 'password123')
ON DUPLICATE KEY UPDATE username = username;

-- App user for API connections from other containers (root@localhost healthchecks
-- can pass while root@<container-ip> is denied without an explicit remote user).
CREATE USER IF NOT EXISTS 'sre_app'@'%' IDENTIFIED WITH mysql_native_password BY 'srepassword';
ALTER USER 'sre_app'@'%' IDENTIFIED WITH mysql_native_password BY 'srepassword';
GRANT ALL PRIVILEGES ON sre_db.* TO 'sre_app'@'%';

-- Keep root usable from the Docker network as well
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'rootpassword';
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'rootpassword';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;

-- Debezium replication user
CREATE USER IF NOT EXISTS 'debezium'@'%' IDENTIFIED WITH mysql_native_password BY 'dbz';
ALTER USER 'debezium'@'%' IDENTIFIED WITH mysql_native_password BY 'dbz';
GRANT SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'debezium'@'%';
FLUSH PRIVILEGES;
