const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "clouddrive_user",
  password: process.env.DB_PASSWORD || "clouddrive_password",
  database: process.env.DB_NAME || "clouddrive"
});

const initDb = async () => {
  try {
    // Test connection
    await pool.query("SELECT NOW()");
    console.log("[Database] PostgreSQL connection established successfully.");

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        storage_key VARCHAR(255) UNIQUE NOT NULL,
        size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("[Database] Schema migrations verified / initialized.");
  } catch (err) {
    console.error("[Database] Migration error:", err);
    process.exit(1);
  }
};

module.exports = {
  pool,
  initDb
};
