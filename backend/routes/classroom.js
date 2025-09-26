const express = require('express');
const { authenticateToken, logActivity } = require('../middleware/auth');
const googleClassroom = require('../utils/googleClassroom');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all courses for the authenticated user
router.get('/courses', logActivity('GET_COURSES'), async (req, res) => {
  try {
    const { role = 'all' } = req.query;

    if (role === 'teacher') {
      const courses = await googleClassroom.getTeacherCourses(req.user.id);
      return res.json({ success: true, data: courses, count: courses.length });
    }
    if (role === 'student') {
      const courses = await googleClassroom.getStudentCourses(req.user.id);
      return res.json({ success: true, data: courses, count: courses.length });
    }

    // default: all
    const courses = await googleClassroom.getCourses(req.user.id);
    res.json({ success: true, data: courses, count: courses.length });
  } catch (error) {
    logger.error('Get courses error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch courses' });
  }
});

// Get specific course details
router.get('/courses/:courseId', logActivity('GET_COURSE', 'course'), async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await googleClassroom.getCourse(req.user.id, courseId);
    
    res.json({
      success: true,
      data: course
    });
  } catch (error) {
    logger.error('Get course error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course details'
    });
  }
});

// Get assignments for a course
router.get('/courses/:courseId/assignments', logActivity('GET_ASSIGNMENTS', 'course'), async (req, res) => {
  try {
    const { courseId } = req.params;
    const assignments = await googleClassroom.getAssignments(req.user.id, courseId);
    
    res.json({
      success: true,
      data: assignments,
      count: assignments.length
    });
  } catch (error) {
    logger.error('Get assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assignments'
    });
  }
});

// Optimized: Get progress summary for all assignments in a course
router.get('/courses/:courseId/assignments/progress-summary', logActivity('GET_ASSIGNMENTS_PROGRESS_SUMMARY', 'course'), async (req, res) => {
  try {
    const { courseId } = req.params;

    // Fetch assignments, students, and all submissions for the course in parallel
    const [assignments, students, submissions] = await Promise.all([
      googleClassroom.getAssignments(req.user.id, courseId),
      googleClassroom.getStudents(req.user.id, courseId),
      // Passing null for assignmentId fetches all submissions for the course
      googleClassroom.getSubmissions(req.user.id, courseId, null, null),
    ]);

    // Build a Set of all student userIds in this course
    const allStudentIds = new Set((students || []).map(st => String(st.userId)));

    // Prepare submissions grouped by assignment and by userId
    const deliveredStates = new Set(['TURNED_IN', 'RETURNED']);
    const subsByAssignment = new Map(); // key: courseWorkId -> array of submissions
    for (const s of (submissions || [])) {
      if (!s || !s.courseWorkId) continue;
      const aId = String(s.courseWorkId);
      if (!subsByAssignment.has(aId)) subsByAssignment.set(aId, []);
      subsByAssignment.get(aId).push(s);
    }

    const result = (assignments || []).map(a => {
      // Determine applicable students for this assignment
      let applicableIds;
      if (a.assigneeMode === 'INDIVIDUAL_STUDENTS') {
        const ids = (a.individualStudentsOptions?.studentIds || []).map(String);
        // Intersect with current course students to avoid counting outsiders
        applicableIds = new Set(ids.filter(id => allStudentIds.has(id)));
      } else {
        applicableIds = new Set(allStudentIds);
      }

      const total = applicableIds.size;

      // Count delivered submissions only among applicable students
      let submitted = 0;
      const subs = subsByAssignment.get(String(a.id)) || [];
      for (const s of subs) {
        const uid = String(s.userId);
        if (!applicableIds.has(uid)) continue;
        if (deliveredStates.has(s.state)) submitted += 1;
      }

      const percent = total ? Math.round((submitted / total) * 100) : 0;
      return {
        id: a.id,
        title: a.title,
        description: a.description || null,
        dueDate: a.dueDate || null,
        alternateLink: a.alternateLink || null,
        state: a.state,
        creationTime: a.creationTime || null,
        maxPoints: a.maxPoints || null,
        progress: { submitted, total, percent },
      };
    });

    res.json({ success: true, data: result, count: result.length });
  } catch (error) {
    logger.error('Get assignments progress summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assignments progress summary' });
  }
});

// Student-specific: summary for assignments in a course (for the authenticated student)
router.get('/courses/:courseId/assignments/student-summary', logActivity('GET_STUDENT_ASSIGNMENTS_SUMMARY', 'course'), async (req, res) => {
  try {
    const { courseId } = req.params;

    // Fetch assignments metadata and this student's submissions
    const [assignments, submissions] = await Promise.all([
      googleClassroom.getAssignments(req.user.id, courseId),
      // Limit to the authenticated student's submissions
      googleClassroom.getSubmissions(req.user.id, courseId, null, 'me'),
    ]);

    const deliveredStates = new Set(['TURNED_IN', 'RETURNED']);

    // Map submissions by coursework for quick lookup
    const subByAssignment = new Map();
    for (const s of (submissions || [])) {
      if (!s || !s.courseWorkId) continue;
      subByAssignment.set(String(s.courseWorkId), s);
    }

    // Total should be the number of assignments visible to the student
    const visibleAssignments = (assignments || []);
    const total = visibleAssignments.length;

    let submitted = 0;
    const pending = [];
    for (const a of visibleAssignments) {
      const s = subByAssignment.get(String(a.id));
      const isDelivered = s && deliveredStates.has(s.state);
      if (isDelivered) submitted += 1;
      else {
        pending.push({
          id: a.id,
          title: a.title,
          dueDate: a.dueDate || null,
          alternateLink: a.alternateLink || null,
        });
      }
    }

    const percent = total ? Math.round((submitted / total) * 100) : 0;

    res.json({ success: true, data: { total, submitted, percent, pending } });
  } catch (error) {
    logger.error('Get student assignments summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch student assignments summary' });
  }
});

// Student-specific: list assignments with status (delivered|missing|overdue)
router.get('/courses/:courseId/assignments/student-list', logActivity('GET_STUDENT_ASSIGNMENTS_LIST', 'course'), async (req, res) => {
  try {
    const { courseId } = req.params;

    const [assignments, submissions] = await Promise.all([
      googleClassroom.getAssignments(req.user.id, courseId),
      googleClassroom.getSubmissions(req.user.id, courseId, null, 'me'),
    ]);

    const subByAssignment = new Map();
    for (const s of (submissions || [])) {
      if (!s || !s.courseWorkId) continue;
      subByAssignment.set(String(s.courseWorkId), s);
    }

    const deliveredStates = new Set(['TURNED_IN', 'RETURNED']);

    const list = (assignments || []).map(a => {
      const s = subByAssignment.get(String(a.id));
      const delivered = !!(s && deliveredStates.has(s.state));
      // Determine overdue using assignment dueDate
      let overdue = false;
      if (a.dueDate && a.dueDate.year) {
        const now = new Date();
        const d = new Date(a.dueDate.year, a.dueDate.month - 1, a.dueDate.day, 23, 59, 59);
        overdue = d.getTime() < now.getTime() && !delivered;
      }
      const status = delivered ? 'delivered' : (overdue ? 'overdue' : 'missing');
      return {
        id: a.id,
        title: a.title,
        dueDate: a.dueDate || null,
        alternateLink: a.alternateLink || null,
        status,
      };
    });

    res.json({ success: true, data: list, count: list.length });
  } catch (error) {
    logger.error('Get student assignments list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch student assignments' });
  }
});

// Get submissions for an assignment
router.get('/courses/:courseId/assignments/:assignmentId/submissions', 
  logActivity('GET_SUBMISSIONS', 'assignment'), 
  async (req, res) => {
    try {
      const { courseId, assignmentId } = req.params;
      
      // Check if user has permission to view submissions
      if (req.user.role === 'student') {
        return res.status(403).json({
          success: false,
          error: 'Students can only view their own submissions'
        });
      }
      
      const submissions = await googleClassroom.getSubmissions(req.user.id, courseId, assignmentId);
      
      res.json({
        success: true,
        data: submissions,
        count: submissions.length
      });
    } catch (error) {
      logger.error('Get submissions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch submissions'
      });
    }
  }
);

// Get consolidated student progress for a course
router.get('/courses/:courseId/progress', async (req, res) => {
  try {
    const { courseId } = req.params;
    const progressData = await googleClassroom.getCourseProgress(req.user.id, courseId);
    res.json({ success: true, data: progressData });
  } catch (error) {
    logger.error(`Failed to get course progress for ${req.params.courseId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to retrieve course progress' });
  }
});

// Get all students in a course
router.get('/courses/:courseId/students', async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Only teachers and coordinators can view student lists
    if (req.user.role === 'student') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const students = await googleClassroom.getStudents(req.user.id, courseId);
    
    res.json({
      success: true,
      data: students,
      count: students.length
    });
  } catch (error) {
    logger.error('Get students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students'
    });
  }
});

// Get teachers in a course
router.get('/courses/:courseId/teachers', logActivity('GET_TEACHERS', 'course'), async (req, res) => {
  try {
    const { courseId } = req.params;
    const teachers = await googleClassroom.getTeachers(req.user.id, courseId);
    
    res.json({
      success: true,
      data: teachers,
      count: teachers.length
    });
  } catch (error) {
    logger.error('Get teachers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teachers'
    });
  }
});

// Get cached course data (faster for dashboards)
router.get('/cache/courses', logActivity('GET_CACHED_COURSES'), async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, u.name as teacher_name 
       FROM courses_cache c
       LEFT JOIN users u ON c.teacher_id = u.id
       WHERE c.course_state = 'ACTIVE'
       ORDER BY c.name`
    );
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Get cached courses error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cached courses'
    });
  }
});

// Get cached assignments for a course
router.get('/cache/courses/:courseId/assignments', logActivity('GET_CACHED_ASSIGNMENTS'), async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const result = await query(
      `SELECT * FROM assignments_cache 
       WHERE course_id = $1 AND state = 'PUBLISHED'
       ORDER BY due_date ASC NULLS LAST, creation_time DESC`,
      [courseId]
    );
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Get cached assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cached assignments'
    });
  }
});

// Get user's submission for a specific assignment
router.get('/courses/:courseId/assignments/:assignmentId/my-submission', 
  logActivity('GET_MY_SUBMISSION'), 
  async (req, res) => {
    try {
      const { courseId, assignmentId } = req.params;
      
      const result = await query(
        `SELECT * FROM submissions_cache 
         WHERE assignment_id = $1 AND course_id = $2 AND user_id = $3`,
        [assignmentId, courseId, req.user.id]
      );
      
      res.json({
        success: true,
        data: result.rows[0] || null
      });
    } catch (error) {
      logger.error('Get my submission error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch submission'
      });
    }
  }
);

// Sync data from Google Classroom (force refresh)
router.post('/sync', logActivity('SYNC_CLASSROOM_DATA'), async (req, res) => {
  try {
    const { courseId } = req.body;
    
    if (courseId) {
      // Sync specific course
      const course = await googleClassroom.getCourse(req.user.id, courseId);
      const assignments = await googleClassroom.getAssignments(req.user.id, courseId);
      
      res.json({
        success: true,
        message: 'Course data synced successfully',
        data: { course, assignments: assignments.length }
      });
    } else {
      // Sync all courses
      const courses = await googleClassroom.getCourses(req.user.id);
      
      res.json({
        success: true,
        message: 'All courses synced successfully',
        data: { courses: courses.length }
      });
    }
  } catch (error) {
    logger.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync classroom data'
    });
  }
});

// Get cached course data (faster for dashboards)
router.get('/cache/courses', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, u.name as teacher_name 
       FROM courses_cache c
       LEFT JOIN users u ON c.teacher_id = u.id
       WHERE c.course_state = 'ACTIVE'
       ORDER BY c.name`
    );
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Get cached courses error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cached courses'
    });
  }
});

module.exports = router;
