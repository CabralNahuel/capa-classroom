const express = require('express');
const { authenticateToken, requireCoordinator, logActivity } = require('../middleware/auth');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all users (coordinators only)
router.get('/', requireCoordinator, logActivity('GET_ALL_USERS'), async (req, res) => {
  try {
    const { page = 1, limit = 50, role, domain, search } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (role) {
      paramCount++;
      whereClause += ` AND role = $${paramCount}`;
      params.push(role);
    }
    
    if (domain) {
      paramCount++;
      whereClause += ` AND domain = $${paramCount}`;
      params.push(domain);
    }
    
    if (search) {
      paramCount++;
      whereClause += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    
    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      params
    );
    
    // Get users with pagination
    paramCount++;
    params.push(limit);
    paramCount++;
    params.push(offset);
    
    const result = await query(
      `SELECT id, google_id, email, name, picture, role, domain, created_at, last_login
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
      params
    );
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// Get user by ID
router.get('/:userId', requireCoordinator, logActivity('GET_USER'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await query(
      `SELECT id, google_id, email, name, picture, role, domain, created_at, updated_at, last_login
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user'
    });
  }
});

// Update user role (coordinators only)
router.put('/:userId/role', requireCoordinator, logActivity('UPDATE_USER_ROLE'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    const validRoles = ['student', 'teacher', 'coordinator'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      });
    }
    
    const result = await query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [role, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    logger.info(`User role updated: ${result.rows[0].email} -> ${role} by ${req.user.email}`);
    
    res.json({
      success: true,
      message: 'User role updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user role'
    });
  }
});

// Get user statistics
router.get('/stats/overview', requireCoordinator, logActivity('GET_USER_STATS'), async (req, res) => {
  try {
    // Get user counts by role
    const roleStats = await query(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
      ORDER BY role
    `);
    
    // Get user counts by domain
    const domainStats = await query(`
      SELECT domain, COUNT(*) as count
      FROM users
      WHERE domain IS NOT NULL
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Get recent registrations (last 30 days)
    const recentRegistrations = await query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    // Get active users (logged in last 7 days)
    const activeUsers = await query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE last_login >= CURRENT_DATE - INTERVAL '7 days'
    `);
    
    res.json({
      success: true,
      data: {
        roleDistribution: roleStats.rows,
        domainDistribution: domainStats.rows,
        recentRegistrations: recentRegistrations.rows,
        activeUsers: parseInt(activeUsers.rows[0].count)
      }
    });
  } catch (error) {
    logger.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics'
    });
  }
});

// Get user activity log
router.get('/:userId/activity', requireCoordinator, logActivity('GET_USER_ACTIVITY'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    const result = await query(
      `SELECT action, resource_type, resource_id, details, ip_address, created_at
       FROM activity_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    const countResult = await query(
      'SELECT COUNT(*) FROM activity_logs WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    logger.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user activity'
    });
  }
});

// Delete user (coordinators only)
router.delete('/:userId', requireCoordinator, logActivity('DELETE_USER'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent self-deletion
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING email',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    logger.info(`User deleted: ${result.rows[0].email} by ${req.user.email}`);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

module.exports = router;
