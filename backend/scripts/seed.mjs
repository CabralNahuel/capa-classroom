import dotenv from 'dotenv';
import pg from 'pg';
import { faker } from '@faker-js/faker';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const NUM_STUDENTS = 20;
const NUM_COURSES = 2;
const NUM_ASSIGNMENTS_PER_COURSE = 10;

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Starting to seed database...');
    await client.query('BEGIN');

    // Clean up previous mock data if necessary (optional)
    // await client.query('TRUNCATE users, courses_cache, assignments_cache, submissions_cache RESTART IDENTITY CASCADE');

    // Find the main user and assign courses to them
    const userEmail = 'cabralnahuel.dev@gmail.com';
    let teacherRes = await client.query("SELECT id FROM users WHERE email = $1", [userEmail]);
    let teacherId;

    if (teacherRes.rows.length === 0) {
      console.error(`Error: User ${userEmail} not found. Please log in with that user at least once before seeding.`);
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
      return;
    }
    teacherId = teacherRes.rows[0].id;
    console.log(`Assigning mock courses to user ${userEmail} (ID: ${teacherId})`);

    // Create mock students
    const studentIds = [];
    for (let i = 0; i < NUM_STUDENTS; i++) {
      const studentRes = await client.query(
        `INSERT INTO users (google_id, email, name, role) VALUES ($1, $2, $3, 'student') RETURNING id`,
        [faker.string.uuid(), faker.internet.email(), faker.person.fullName()]
      );
      studentIds.push(studentRes.rows[0].id);
    }
    console.log(`${NUM_STUDENTS} mock students created.`);

    // Create mock courses and assignments
    for (let i = 0; i < NUM_COURSES; i++) {
      const courseRes = await client.query(
        `INSERT INTO courses_cache (course_id, name, section, teacher_id, course_state) VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING course_id`,
        [faker.string.alphanumeric(7), faker.company.catchPhrase(), `Section ${i + 1}`, teacherId]
      );
      const courseId = courseRes.rows[0].course_id;
      console.log(`Course '${courseRes.rows[0].name}' created.`);

      for (let j = 0; j < NUM_ASSIGNMENTS_PER_COURSE; j++) {
        const assignmentRes = await client.query(
          `INSERT INTO assignments_cache (assignment_id, course_id, title, max_points) VALUES ($1, $2, $3, 100) RETURNING assignment_id`,
          [faker.string.alphanumeric(8), courseId, `Assignment ${j + 1}: ${faker.lorem.words(3)}`]
        );
        const assignmentId = assignmentRes.rows[0].assignment_id;

        // Create mock submissions for each student
        for (const studentId of studentIds) {
          // Simulate some students not submitting
          if (Math.random() > 0.15) { 
            const assignedGrade = Math.random() > 0.1 ? faker.number.int({ min: 45, max: 100 }) : null;
            await client.query(
              `INSERT INTO submissions_cache (submission_id, assignment_id, course_id, user_id, state, assigned_grade)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [faker.string.alphanumeric(9), assignmentId, courseId, studentId, 'RETURNED', assignedGrade]
            );
          }
        }
      }
      console.log(`${NUM_ASSIGNMENTS_PER_COURSE} assignments with submissions created for course ${courseId}.`);
    }

    await client.query('COMMIT');
    console.log('Database seeding completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
