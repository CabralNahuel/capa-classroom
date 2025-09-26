const { google } = require('googleapis');
const { query } = require('../config/database');
const logger = require('./logger');

class GoogleClassroomService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  // Get courses where the authenticated user is a teacher
  async getTeacherCourses(userId) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const response = await classroom.courses.list({
        courseStates: ['ACTIVE'],
        teacherId: 'me',
      });

      const courses = response.data.courses || [];
      for (const course of courses) {
        await this.cacheCourse(course);
      }
      return courses;
    } catch (error) {
      logger.error('Failed to get teacher courses:', error);
      throw error;
    }
  }

  // Get courses where the authenticated user is a student
  async getStudentCourses(userId) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const response = await classroom.courses.list({
        courseStates: ['ACTIVE'],
        studentId: 'me',
      });

      const courses = response.data.courses || [];
      for (const course of courses) {
        await this.cacheCourse(course);
      }
      return courses;
    } catch (error) {
      logger.error('Failed to get student courses:', error);
      throw error;
    }
  }

  // Get authenticated client for a user
  async getAuthenticatedClient(userId) {
    try {
      const result = await query(
        'SELECT access_token, refresh_token, token_expires_at FROM user_sessions WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('No authentication tokens found for user');
      }

      const { access_token, refresh_token, token_expires_at } = result.rows[0];

      this.oauth2Client.setCredentials({
        access_token,
        refresh_token,
        expiry_date: token_expires_at ? new Date(token_expires_at).getTime() : null
      });

      // Check if token needs refresh
      if (token_expires_at && new Date() >= new Date(token_expires_at)) {
        await this.refreshToken(userId);
      }

      return this.oauth2Client;
    } catch (error) {
      logger.error('Failed to get authenticated client:', error);
      throw error;
    }
  }

  // Refresh access token
  async refreshToken(userId) {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      await query(
        `UPDATE user_sessions 
         SET access_token = $1, token_expires_at = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [
          credentials.access_token,
          new Date(credentials.expiry_date),
          userId
        ]
      );

      this.oauth2Client.setCredentials(credentials);
      logger.info(`Token refreshed for user ${userId}`);
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw error;
    }
  }

  // Get all courses for a user
  async getCourses(userId) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const response = await classroom.courses.list({
        courseStates: ['ACTIVE']
      });

      const courses = response.data.courses || [];
      
      // Cache courses in database
      for (const course of courses) {
        await this.cacheCourse(course);
      }

      return courses;
    } catch (error) {
      logger.error('Failed to get courses:', error);
      throw error;
    }
  }

  // Get course details
  async getCourse(userId, courseId) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const response = await classroom.courses.get({ id: courseId });
      const course = response.data;

      await this.cacheCourse(course);
      return course;
    } catch (error) {
      logger.error('Failed to get course:', error);
      throw error;
    }
  }

  // Get assignments for a course
  async getAssignments(userId, courseId) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const response = await classroom.courses.courseWork.list({
        courseId: courseId,
        courseWorkStates: ['PUBLISHED']
      });

      const assignments = response.data.courseWork || [];

      // Cache assignments
      for (const assignment of assignments) {
        await this.cacheAssignment(assignment, courseId);
      }

      return assignments;
    } catch (error) {
      logger.error('Failed to get assignments:', error);
      throw error;
    }
  }

  // Get student submissions for an assignment or for a user
  async getSubmissions(userId, courseId, assignmentId, studentId = null) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const params = {
        courseId: courseId,
        courseWorkId: assignmentId || '-', // Use '-' to get all submissions for a course
        userId: studentId || undefined
      };

      const response = await classroom.courses.courseWork.studentSubmissions.list(params);

      const submissions = response.data.studentSubmissions || [];

      // Cache submissions
      for (const submission of submissions) {
        await this.cacheSubmission(submission, assignmentId, courseId);
      }

      return submissions;
    } catch (error) {
      logger.error('Failed to get submissions:', error);
      throw error;
    }
  }

  // Get students in a course
  async getStudents(userId, courseId) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const response = await classroom.courses.students.list({
        courseId: courseId
      });

      return response.data.students || [];
    } catch (error) {
      logger.error('Failed to get students:', error);
      throw error;
    }
  }

  // Get teachers in a course
  async getTeachers(userId, courseId) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const classroom = google.classroom({ version: 'v1', auth });

      const response = await classroom.courses.teachers.list({
        courseId: courseId
      });

      return response.data.teachers || [];
    } catch (error) {
      logger.error('Failed to get teachers:', error);
      throw error;
    }
  }

  // Get consolidated student progress for a course
  async getCourseProgress(userId, courseId) {
    try {
      const students = await this.getStudents(userId, courseId);
      const assignments = await this.getAssignments(userId, courseId);
      
      const progressPromises = students.map(async (student) => {
        // Fetch all submissions for this student in this course
        const submissions = await this.getSubmissions(userId, courseId, null, student.userId);
        
        const submittedCount = submissions.filter(s => s.state === 'TURNED_IN' || s.state === 'RETURNED').length;
        const gradedSubmissions = submissions.filter(s => s.assignedGrade !== undefined && s.assignedGrade !== null);
        
        const totalPoints = gradedSubmissions.reduce((sum, s) => sum + s.assignedGrade, 0);
        const averageGrade = gradedSubmissions.length > 0 ? totalPoints / gradedSubmissions.length : 0;
        
        return {
          ...student,
          progress: {
            totalAssignments: assignments.length,
            submittedCount,
            missingCount: assignments.length - submittedCount,
            averageGrade: parseFloat(averageGrade.toFixed(2)),
          }
        };
      });

      const progressData = await Promise.all(progressPromises);
      return progressData;

    } catch (error) {
      logger.error(`Error getting course progress for course ${courseId}:`, error);
      throw new Error('Failed to get course progress');
    }
  }

  // Cache course in database
  async cacheCourse(course) {
    try {
      await query(
        `INSERT INTO courses_cache 
         (course_id, name, description, section, enrollment_code, course_state, creation_time, update_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (course_id) DO UPDATE SET
         name = $2, description = $3, section = $4, enrollment_code = $5, 
         course_state = $6, update_time = $8, cached_at = CURRENT_TIMESTAMP`,
        [
          course.id,
          course.name,
          course.description || null,
          course.section || null,
          course.enrollmentCode || null,
          course.courseState,
          course.creationTime ? new Date(course.creationTime) : null,
          course.updateTime ? new Date(course.updateTime) : null
        ]
      );
    } catch (error) {
      logger.error('Failed to cache course:', error);
    }
  }

  // Cache assignment in database
  async cacheAssignment(assignment, courseId) {
    try {
      await query(
        `INSERT INTO assignments_cache 
         (assignment_id, course_id, title, description, state, creation_time, due_date, max_points)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (assignment_id, course_id) DO UPDATE SET
         title = $3, description = $4, state = $5, due_date = $7, 
         max_points = $8, cached_at = CURRENT_TIMESTAMP`,
        [
          assignment.id,
          courseId,
          assignment.title,
          assignment.description || null,
          assignment.state,
          assignment.creationTime ? new Date(assignment.creationTime) : null,
          assignment.dueDate ? new Date(assignment.dueDate.year, assignment.dueDate.month - 1, assignment.dueDate.day) : null,
          assignment.maxPoints || null
        ]
      );
    } catch (error) {
      logger.error('Failed to cache assignment:', error);
    }
  }

  // Cache submission in database
  async cacheSubmission(submission, assignmentId, courseId) {
    try {
      // Find user by Google ID
      const userResult = await query(
        'SELECT id FROM users WHERE google_id = $1',
        [submission.userId]
      );

      const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

      await query(
        `INSERT INTO submissions_cache 
         (submission_id, assignment_id, course_id, user_id, state, late, draft_grade, assigned_grade, submission_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (submission_id, assignment_id, course_id) DO UPDATE SET
         state = $5, late = $6, draft_grade = $7, assigned_grade = $8, 
         submission_time = $9, cached_at = CURRENT_TIMESTAMP`,
        [
          submission.id,
          assignmentId,
          courseId,
          userId,
          submission.state,
          submission.late || false,
          submission.draftGrade || null,
          submission.assignedGrade || null,
          submission.updateTime ? new Date(submission.updateTime) : null
        ]
      );
    } catch (error) {
      logger.error('Failed to cache submission:', error);
    }
  }
}

module.exports = new GoogleClassroomService();
