const express = require('express');
const { authenticateToken, requireTeacherOrCoordinator, requireCoordinator, logActivity } = require('../middleware/auth');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const googleClassroom = require('../utils/googleClassroom');
const googleDirectory = require('../utils/googleDirectory');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Students overview across teacher's courses
router.get('/students-overview', requireTeacherOrCoordinator, logActivity('GET_STUDENTS_OVERVIEW'), async (req, res) => {
  try {
    const courses = await googleClassroom.getTeacherCourses(req.user.id);

    const studentsMap = new Map(); // userId -> aggregate

    for (const course of courses) {
      const [students, assignments, submissions] = await Promise.all([
        googleClassroom.getStudents(req.user.id, course.id),
        googleClassroom.getAssignments(req.user.id, course.id),
        googleClassroom.getSubmissions(req.user.id, course.id, null, null), // all submissions for course
      ]);

      // Index submissions by userId
      const subsByUser = new Map();
      for (const s of submissions) {
        const key = String(s.userId);
        if (!subsByUser.has(key)) subsByUser.set(key, []);
        subsByUser.get(key).push(s);
      }

      // Helper to know if assignment applies to a student
      const appliesToStudent = (assignment, studentUserId) => {
        if (assignment.assigneeMode === 'INDIVIDUAL_STUDENTS') {
          const ids = assignment.individualStudentsOptions?.studentIds || [];
          return ids.map(String).includes(String(studentUserId));
        }
        return true;
      };

      for (const s of students) {
        const userId = String(s.userId);
        const profile = s.profile || {};
        if (!studentsMap.has(userId)) {
          studentsMap.set(userId, {
            userId,
            name: profile.name?.fullName || '—',
            email: profile.emailAddress || '—',
            courses: new Map(), // courseId -> courseName
            totalAssignments: 0,
            submittedCount: 0,
            missingCount: 0,
            grades: [],
            missingDetails: [],
          });

// Cache-based course completion for coordinators (uses assignments_cache and submissions_cache)
router.get('/course-completion-cache', requireCoordinator, logActivity('GET_COURSE_COMPLETION_CACHE'), async (req, res) => {
  try {
    // Get all active courses from cache
    const { rows: courses } = await query(`
      SELECT course_id, name
      FROM courses_cache
      WHERE course_state = 'ACTIVE'
    `);

    const result = [];
    for (const c of courses) {
      // Get assignments for course
      const { rows: assigns } = await query(`
        SELECT assignment_id
        FROM assignments_cache
        WHERE course_id = $1 AND state = 'PUBLISHED'
      `, [c.course_id]);

      const assignmentIds = assigns.map(a => a.assignment_id);
      if (assignmentIds.length === 0) {
        result.push({
          courseId: String(c.course_id),
          courseName: c.name,
          consideredStudents: 0,
          completedStudents: 0,
          completionRate: 0,
        });
        continue;
      }

      // Get submissions for course from cache
      const { rows: subs } = await query(`
        SELECT user_id, assignment_id, state
        FROM submissions_cache
        WHERE course_id = $1 AND assignment_id = ANY($2)
      `, [c.course_id, assignmentIds]);

      // Group by user
      const byUser = new Map();
      for (const s of subs) {
        const uid = String(s.user_id);
        if (!byUser.has(uid)) byUser.set(uid, new Map());
        byUser.get(uid).set(String(s.assignment_id), s.state);
      }

      // Considered students: distinct user_ids that have at least 1 submission row in cache
      const consideredStudents = byUser.size;
      const deliveredStates = new Set(['TURNED_IN', 'RETURNED']);

      let completedStudents = 0;
      for (const [uid, map] of byUser.entries()) {
        let allDone = true;
        for (const aid of assignmentIds) {
          const state = map.get(String(aid));
          if (!state || !deliveredStates.has(state)) { allDone = false; break; }
        }
        if (allDone) completedStudents += 1;
      }

      const completionRate = consideredStudents ? Math.round((completedStudents / consideredStudents) * 100) : 0;
      result.push({
        courseId: String(c.course_id),
        courseName: c.name,
        consideredStudents,
        completedStudents,
        completionRate,
      });
    }

    res.json({ success: true, data: result, count: result.length });
  } catch (error) {
    logger.error('Get course completion (cache) error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch course completion (cache)' });
  }
});

// Course completion: percentage of students who submitted all applicable assignments
router.get('/course-completion', requireTeacherOrCoordinator, logActivity('GET_COURSE_COMPLETION'), async (req, res) => {
  try {
    const courses = await googleClassroom.getTeacherCourses(req.user.id);

    const result = [];

    for (const course of courses) {
      // Fetch in parallel
      const [students, assignments, submissions] = await Promise.all([
        googleClassroom.getStudents(req.user.id, course.id),
        googleClassroom.getAssignments(req.user.id, course.id),
        googleClassroom.getSubmissions(req.user.id, course.id, null, null),
      ]);

      // Index submissions by userId and courseWorkId
      const subsByUser = new Map();
      for (const s of submissions) {
        const uid = String(s.userId);
        if (!subsByUser.has(uid)) subsByUser.set(uid, new Map());
        subsByUser.get(uid).set(String(s.courseWorkId), s);
      }

      const appliesToStudent = (assignment, studentUserId) => {
        if (assignment.assigneeMode === 'INDIVIDUAL_STUDENTS') {
          const ids = assignment.individualStudentsOptions?.studentIds || [];
          return ids.map(String).includes(String(studentUserId));
        }
        return true;
      };

      let totalConsideredStudents = 0;
      let completedStudents = 0;

      for (const st of students) {
        const uid = String(st.userId);
        const applicable = assignments.filter(a => appliesToStudent(a, uid));
        if (applicable.length === 0) continue; // ignore students with no applicable work
        totalConsideredStudents += 1;

        let allDone = true;
        const map = subsByUser.get(uid) || new Map();
        for (const a of applicable) {
          const sub = map.get(String(a.id));
          const turnedIn = sub && (sub.state === 'TURNED_IN' || sub.state === 'RETURNED');
          if (!turnedIn) { allDone = false; break; }
        }
        if (allDone) completedStudents += 1;
      }

      const rate = totalConsideredStudents ? Math.round((completedStudents / totalConsideredStudents) * 100) : 0;
      result.push({
        courseId: String(course.id),
        courseName: course.name,
        consideredStudents: totalConsideredStudents,
        completedStudents,
        completionRate: rate,
      });
    }

    res.json({ success: true, data: result, count: result.length });
  } catch (error) {
    logger.error('Get course completion error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch course completion' });
  }
});

// Import mapping of student emails (Option B)
router.post('/students-import', requireTeacherOrCoordinator, logActivity('POST_STUDENTS_IMPORT'), async (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'rows must be a non-empty array' });
    }

    const results = [];
    for (const r of rows) {
      const googleId = r.googleId || r.userId || r.id;
      const email = r.email || null;
      const name = r.name || null;
      if (!googleId || !email) {
        results.push({ googleId, ok: false, error: 'googleId and email required' });
        continue;
      }
      try {
        await query(
          `INSERT INTO users (google_id, email, name, role)
           VALUES ($1, $2, COALESCE($3, name), COALESCE(role, 'student'))
           ON CONFLICT (google_id)
           DO UPDATE SET email = EXCLUDED.email, name = COALESCE(EXCLUDED.name, users.name)`,
          [googleId, email, name]
        );
        results.push({ googleId, ok: true });
      } catch (e) {
        logger.error('students-import upsert error', e);
        results.push({ googleId, ok: false, error: 'db error' });
      }
    }

    res.json({ success: true, count: results.filter(r => r.ok).length, results });
  } catch (error) {
    logger.error('Students import error:', error);
    res.status(500).json({ success: false, error: 'Failed to import students' });
  }
});
        }
        const agg = studentsMap.get(userId);
        // If email is missing from Classroom profile, try Admin SDK and then local DB
        if (!agg.email || agg.email === '—') {
          try {
            const dirUser = await googleDirectory.getUserById(userId);
            if (dirUser?.primaryEmail) {
              agg.email = dirUser.primaryEmail;
              if (!agg.name || agg.name === '—') {
                agg.name = dirUser.name?.fullName || agg.name;
              }
            }
            // fallback to DB
            const dbRes = await query('SELECT email, name FROM users WHERE google_id = $1 LIMIT 1', [userId]);
            if (dbRes.rows.length) {
              agg.email = dbRes.rows[0].email || agg.email;
              if (!agg.name || agg.name === '—') {
                agg.name = dbRes.rows[0].name || agg.name;
              }
            }
          } catch (e) {
            logger.warn('Failed to backfill email for userId ' + userId);
          }
        }
        agg.courses.set(String(course.id), course.name);

        // Count assignments applicable to this student
        const applicable = assignments.filter(a => appliesToStudent(a, userId));
        agg.totalAssignments += applicable.length;

        // Submissions for this student in this course
        const mySubs = subsByUser.get(userId) || [];

        // Build a map assignmentId -> submission
        const subByAssignment = new Map();
        for (const sub of mySubs) subByAssignment.set(String(sub.courseWorkId), sub);

        for (const a of applicable) {
          const sub = subByAssignment.get(String(a.id));
          const turnedIn = sub && (sub.state === 'TURNED_IN' || sub.state === 'RETURNED');
          if (turnedIn) agg.submittedCount += 1;
          else agg.missingCount += 1;

          const grade = sub?.assignedGrade ?? sub?.draftGrade;
          if (typeof grade === 'number') agg.grades.push(grade);

          if (!turnedIn) {
            agg.missingDetails.push({
              courseId: String(course.id),
              courseName: course.name,
              assignmentId: String(a.id),
              title: a.title,
              dueDate: a.dueDate ? new Date(a.dueDate.year, a.dueDate.month - 1, a.dueDate.day) : null,
            });
          }
        }
      }
    }

    // Build array only from Classroom aggregation (LIVE ONLY)
    const result = Array.from(studentsMap.values()).map(x => ({
      userId: x.userId,
      name: x.name,
      email: x.email,
      courses: Array.from(x.courses, ([courseId, courseName]) => ({ courseId, courseName })),
      totalAssignments: x.totalAssignments,
      submittedCount: x.submittedCount,
      missingCount: x.missingCount,
      averageGrade: x.grades.length ? x.grades.reduce((a, b) => a + b, 0) / x.grades.length : null,
      missingDetails: x.missingDetails,
    }));

    res.json({ success: true, data: result, count: result.length });
  } catch (error) {
    logger.error('Get students overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch students overview' });
  }
});

// Get student performance report
router.get('/student-performance/:studentId', 
  requireTeacherOrCoordinator, 
  logActivity('GET_STUDENT_REPORT'), 
  async (req, res) => {
    try {
      const { studentId } = req.params;
      const { courseId } = req.query;
      
      let courseFilter = '';
      const params = [studentId];
      
      if (courseId) {
        courseFilter = 'AND s.course_id = $2';
        params.push(courseId);
      }
      
      // Get student submissions with assignment details
      const submissions = await query(`
        SELECT 
          s.*,
          a.title as assignment_title,
          a.max_points,
          a.due_date,
          c.name as course_name,
          CASE 
            WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
            WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
            ELSE 0
          END as final_grade
        FROM submissions_cache s
        JOIN assignments_cache a ON s.assignment_id = a.assignment_id AND s.course_id = a.course_id
        JOIN courses_cache c ON s.course_id = c.course_id
        WHERE s.user_id = $1 ${courseFilter}
        ORDER BY a.due_date DESC NULLS LAST, a.creation_time DESC
      `, params);
      
      // Calculate statistics
      const stats = await query(`
        SELECT 
          COUNT(*) as total_assignments,
          COUNT(CASE WHEN s.state = 'TURNED_IN' THEN 1 END) as submitted_assignments,
          COUNT(CASE WHEN s.late = true THEN 1 END) as late_submissions,
          AVG(CASE 
            WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
            WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
            ELSE NULL
          END) as average_grade,
          AVG(a.max_points) as average_max_points
        FROM submissions_cache s
        JOIN assignments_cache a ON s.assignment_id = a.assignment_id AND s.course_id = a.course_id
        WHERE s.user_id = $1 ${courseFilter}
      `, params);
      
      res.json({
        success: true,
        data: {
          submissions: submissions.rows,
          statistics: stats.rows[0]
        }
      });
    } catch (error) {
      logger.error('Get student performance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch student performance report'
      });
    }
  }
);

// Get course performance report
router.get('/course-performance/:courseId', 
  requireTeacherOrCoordinator, 
  logActivity('GET_COURSE_REPORT'), 
  async (req, res) => {
    try {
      const { courseId } = req.params;
      
      // Get course overview
      const courseInfo = await query(`
        SELECT * FROM courses_cache WHERE course_id = $1
      `, [courseId]);
      
      if (courseInfo.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Course not found'
        });
      }
      
      // Get assignment statistics
      const assignmentStats = await query(`
        SELECT 
          a.assignment_id,
          a.title,
          a.max_points,
          a.due_date,
          COUNT(s.submission_id) as total_submissions,
          COUNT(CASE WHEN s.state = 'TURNED_IN' THEN 1 END) as submitted_count,
          COUNT(CASE WHEN s.late = true THEN 1 END) as late_count,
          AVG(CASE 
            WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
            WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
            ELSE NULL
          END) as average_grade
        FROM assignments_cache a
        LEFT JOIN submissions_cache s ON a.assignment_id = s.assignment_id AND a.course_id = s.course_id
        WHERE a.course_id = $1
        GROUP BY a.assignment_id, a.title, a.max_points, a.due_date
        ORDER BY a.due_date DESC NULLS LAST
      `, [courseId]);
      
      // Get student performance in course
      const studentPerformance = await query(`
        SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(s.submission_id) as total_submissions,
          COUNT(CASE WHEN s.state = 'TURNED_IN' THEN 1 END) as submitted_count,
          COUNT(CASE WHEN s.late = true THEN 1 END) as late_count,
          AVG(CASE 
            WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
            WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
            ELSE NULL
          END) as average_grade
        FROM users u
        LEFT JOIN submissions_cache s ON u.id = s.user_id AND s.course_id = $1
        WHERE u.role = 'student'
        GROUP BY u.id, u.name, u.email
        HAVING COUNT(s.submission_id) > 0
        ORDER BY average_grade DESC NULLS LAST
      `, [courseId]);
      
      res.json({
        success: true,
        data: {
          course: courseInfo.rows[0],
          assignments: assignmentStats.rows,
          students: studentPerformance.rows
        }
      });
    } catch (error) {
      logger.error('Get course performance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch course performance report'
      });
    }
  }
);

// Get teacher performance report
router.get('/teacher-performance/:teacherId', 
  requireCoordinator, 
  logActivity('GET_TEACHER_REPORT'), 
  async (req, res) => {
    try {
      const { teacherId } = req.params;
      
      // Get teacher info
      const teacherInfo = await query(`
        SELECT id, name, email FROM users WHERE id = $1 AND role = 'teacher'
      `, [teacherId]);
      
      if (teacherInfo.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Teacher not found'
        });
      }
      
      // Get courses taught by teacher
      const courses = await query(`
        SELECT * FROM courses_cache WHERE teacher_id = $1
      `, [teacherId]);
      
      // Get assignment and grading statistics
      const gradingStats = await query(`
        SELECT 
          COUNT(DISTINCT a.assignment_id) as total_assignments,
          COUNT(s.submission_id) as total_submissions,
          COUNT(CASE WHEN s.assigned_grade IS NOT NULL THEN 1 END) as graded_submissions,
          AVG(CASE WHEN s.assigned_grade IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (s.cached_at - s.submission_time))/3600 
          END) as avg_grading_time_hours
        FROM assignments_cache a
        LEFT JOIN submissions_cache s ON a.assignment_id = s.assignment_id AND a.course_id = s.course_id
        JOIN courses_cache c ON a.course_id = c.course_id
        WHERE c.teacher_id = $1
      `, [teacherId]);
      
      res.json({
        success: true,
        data: {
          teacher: teacherInfo.rows[0],
          courses: courses.rows,
          statistics: gradingStats.rows[0]
        }
      });
    } catch (error) {
      logger.error('Get teacher performance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch teacher performance report'
      });
    }
  }
);

// Get overall dashboard statistics (coordinators only)
router.get('/dashboard/overview', 
  requireCoordinator, 
  logActivity('GET_DASHBOARD_OVERVIEW'), 
  async (req, res) => {
    try {
      // Get basic counts
      const basicStats = await query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
          (SELECT COUNT(*) FROM users WHERE role = 'teacher') as total_teachers,
          (SELECT COUNT(*) FROM courses_cache WHERE course_state = 'ACTIVE') as active_courses,
          (SELECT COUNT(*) FROM assignments_cache WHERE state = 'PUBLISHED') as total_assignments
      `);
      
      // Get submission statistics
      const submissionStats = await query(`
        SELECT 
          COUNT(*) as total_submissions,
          COUNT(CASE WHEN state = 'TURNED_IN' THEN 1 END) as submitted_count,
          COUNT(CASE WHEN late = true THEN 1 END) as late_submissions,
          COUNT(CASE WHEN assigned_grade IS NOT NULL THEN 1 END) as graded_submissions
        FROM submissions_cache
      `);
      
      // Get recent activity (last 7 days)
      const recentActivity = await query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as activity_count
        FROM activity_logs
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);
      
      // Get top performing courses
      const topCourses = await query(`
        SELECT 
          c.course_id,
          c.name,
          COUNT(s.submission_id) as total_submissions,
          AVG(CASE 
            WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
            WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
            ELSE NULL
          END) as average_grade
        FROM courses_cache c
        LEFT JOIN submissions_cache s ON c.course_id = s.course_id
        WHERE c.course_state = 'ACTIVE'
        GROUP BY c.course_id, c.name
        HAVING COUNT(s.submission_id) > 0
        ORDER BY average_grade DESC NULLS LAST
        LIMIT 10
      `);
      
      // Get students needing attention (low grades or many late submissions)
      const studentsAtRisk = await query(`
        SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(s.submission_id) as total_submissions,
          COUNT(CASE WHEN s.late = true THEN 1 END) as late_submissions,
          AVG(CASE 
            WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
            WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
            ELSE NULL
          END) as average_grade
        FROM users u
        JOIN submissions_cache s ON u.id = s.user_id
        WHERE u.role = 'student'
        GROUP BY u.id, u.name, u.email
        HAVING 
          AVG(CASE 
            WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
            WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
            ELSE NULL
          END) < 70 
          OR 
          (COUNT(CASE WHEN s.late = true THEN 1 END) * 100.0 / COUNT(s.submission_id)) > 30
        ORDER BY average_grade ASC NULLS LAST
        LIMIT 20
      `);
      
      res.json({
        success: true,
        data: {
          basicStats: basicStats.rows[0],
          submissionStats: submissionStats.rows[0],
          recentActivity: recentActivity.rows,
          topCourses: topCourses.rows,
          studentsAtRisk: studentsAtRisk.rows
        }
      });
    } catch (error) {
      logger.error('Get dashboard overview error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard overview'
      });
    }
  }
);

// Get assignment analytics
router.get('/assignments/analytics', 
  requireTeacherOrCoordinator, 
  logActivity('GET_ASSIGNMENT_ANALYTICS'), 
  async (req, res) => {
    try {
      const { courseId, dateFrom, dateTo } = req.query;
      
      let whereClause = 'WHERE a.state = \'PUBLISHED\'';
      const params = [];
      let paramCount = 0;
      
      if (courseId) {
        paramCount++;
        whereClause += ` AND a.course_id = $${paramCount}`;
        params.push(courseId);
      }
      
      if (dateFrom) {
        paramCount++;
        whereClause += ` AND a.creation_time >= $${paramCount}`;
        params.push(dateFrom);
      }
      
      if (dateTo) {
        paramCount++;
        whereClause += ` AND a.creation_time <= $${paramCount}`;
        params.push(dateTo);
      }
      
      // Get assignment completion rates
      const completionRates = await query(`
        SELECT 
          a.assignment_id,
          a.title,
          a.course_id,
          c.name as course_name,
          a.due_date,
          COUNT(s.submission_id) as total_submissions,
          COUNT(CASE WHEN s.state = 'TURNED_IN' THEN 1 END) as completed_submissions,
          (COUNT(CASE WHEN s.state = 'TURNED_IN' THEN 1 END) * 100.0 / NULLIF(COUNT(s.submission_id), 0)) as completion_rate
        FROM assignments_cache a
        LEFT JOIN submissions_cache s ON a.assignment_id = s.assignment_id AND a.course_id = s.course_id
        LEFT JOIN courses_cache c ON a.course_id = c.course_id
        ${whereClause}
        GROUP BY a.assignment_id, a.title, a.course_id, c.name, a.due_date
        ORDER BY completion_rate DESC NULLS LAST
      `, params);
      
      res.json({
        success: true,
        data: completionRates.rows
      });
    } catch (error) {
      logger.error('Get assignment analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch assignment analytics'
      });
    }
  }
);

// Export report data (CSV format)
router.get('/export/:reportType', 
  requireTeacherOrCoordinator, 
  logActivity('EXPORT_REPORT'), 
  async (req, res) => {
    try {
      const { reportType } = req.params;
      const { courseId, format = 'json' } = req.query;
      
      let data = [];
      
      switch (reportType) {
        case 'student-grades':
          if (!courseId) {
            return res.status(400).json({
              success: false,
              error: 'Course ID is required for student grades report'
            });
          }
          
          const grades = await query(`
            SELECT 
              u.name as student_name,
              u.email as student_email,
              a.title as assignment_title,
              a.max_points,
              CASE 
                WHEN s.assigned_grade IS NOT NULL THEN s.assigned_grade
                WHEN s.draft_grade IS NOT NULL THEN s.draft_grade
                ELSE 0
              END as grade,
              s.late,
              s.submission_time
            FROM assignments_cache a
            LEFT JOIN submissions_cache s ON a.assignment_id = s.assignment_id AND a.course_id = s.course_id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE a.course_id = $1 AND u.role = 'student'
            ORDER BY u.name, a.due_date
          `, [courseId]);
          
          data = grades.rows;
          break;
          
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid report type'
          });
      }
      
      if (format === 'csv') {
        // Convert to CSV
        if (data.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No data found for export'
          });
        }
        
        const headers = Object.keys(data[0]);
        const csvContent = [
          headers.join(','),
          ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${Date.now()}.csv"`);
        res.send(csvContent);
      } else {
        res.json({
          success: true,
          data: data
        });
      }
    } catch (error) {
      logger.error('Export report error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export report'
      });
    }
  }
);

module.exports = router;
