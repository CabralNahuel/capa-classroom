const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Database initialization and table creation
async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        picture VARCHAR(500),
        role VARCHAR(50) DEFAULT 'student',
        domain VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    // Create user_sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create courses_cache table
    await client.query(`
      CREATE TABLE IF NOT EXISTS courses_cache (
        id SERIAL PRIMARY KEY,
        course_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(500) NOT NULL,
        description TEXT,
        section VARCHAR(255),
        teacher_id INTEGER REFERENCES users(id),
        enrollment_code VARCHAR(255),
        course_state VARCHAR(50),
        creation_time TIMESTAMP,
        update_time TIMESTAMP,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create assignments_cache table
    await client.query(`
      CREATE TABLE IF NOT EXISTS assignments_cache (
        id SERIAL PRIMARY KEY,
        assignment_id VARCHAR(255) NOT NULL,
        course_id VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        state VARCHAR(50),
        creation_time TIMESTAMP,
        due_date TIMESTAMP,
        max_points DECIMAL(10,2),
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(assignment_id, course_id)
      )
    `);

    // Create submissions_cache table
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions_cache (
        id SERIAL PRIMARY KEY,
        submission_id VARCHAR(255) NOT NULL,
        assignment_id VARCHAR(255) NOT NULL,
        course_id VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        state VARCHAR(50),
        late BOOLEAN DEFAULT FALSE,
        draft_grade DECIMAL(10,2),
        assigned_grade DECIMAL(10,2),
        submission_time TIMESTAMP,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(submission_id, assignment_id, course_id)
      )
    `);

    // Create course_students table (roster cache)
    await client.query(`
      CREATE TABLE IF NOT EXISTS course_students (
        id SERIAL PRIMARY KEY,
        course_id VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        google_id VARCHAR(255),
        name VARCHAR(255),
        email VARCHAR(255),
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, user_id)
      )
    `);

    // Ensure columns exist for backward compatibility
    await client.query(`
      DO $$ BEGIN
        BEGIN
          ALTER TABLE course_students ALTER COLUMN user_id DROP NOT NULL;
        EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN
          ALTER TABLE course_students ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
        EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN
          ALTER TABLE course_students ADD COLUMN IF NOT EXISTS name VARCHAR(255);
        EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN
          ALTER TABLE course_students ADD COLUMN IF NOT EXISTS email VARCHAR(255);
        EXCEPTION WHEN duplicate_column THEN NULL; END;
      END $$;
    `);

    // Create activity_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(255) NOT NULL,
        resource_type VARCHAR(100),
        resource_id VARCHAR(255),
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses_cache(teacher_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments_cache(course_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions_cache(user_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions_cache(assignment_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_course_students_course ON course_students(course_id);
      CREATE INDEX IF NOT EXISTS idx_course_students_user ON course_students(user_id);
      CREATE INDEX IF NOT EXISTS idx_course_students_google ON course_students(google_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_course_students_course_google 
        ON course_students(course_id, google_id) WHERE google_id IS NOT NULL;
    `);

    logger.info('Database tables initialized successfully');
  } catch (error) {
    logger.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to execute queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Database query error:', { text, error: error.message });
    throw error;
  }
}

// Helper function to get a client from the pool
async function getClient() {
  return await pool.connect();
}

// Graceful shutdown
async function closePool() {
  await pool.end();
  logger.info('Database pool closed');
}

module.exports = {
  pool,
  query,
  getClient,
  initializeDatabase,
  closePool
};
