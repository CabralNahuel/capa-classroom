const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, google_id, email, name, picture, role, domain FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    logger.error('Token verification failed:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }
    
    return res.status(403).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// Middleware to check user roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// Middleware to check if user is coordinator
const requireCoordinator = authorizeRoles('coordinator', 'admin');

// Middleware to check if user is teacher or coordinator
const requireTeacherOrCoordinator = authorizeRoles('teacher', 'coordinator', 'admin');

// Middleware to log user activity
const logActivity = (action, resourceType = null) => {
  return async (req, res, next) => {
    try {
      if (req.user) {
        await query(
          `INSERT INTO activity_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            req.user.id,
            action,
            resourceType,
            req.params.id || req.params.courseId || null,
            JSON.stringify({
              method: req.method,
              path: req.path,
              query: req.query,
              body: req.method !== 'GET' ? req.body : undefined
            }),
            req.ip,
            req.get('User-Agent')
          ]
        );
      }
    } catch (error) {
      logger.error('Failed to log activity:', error);
      // Don't fail the request if logging fails
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireCoordinator,
  requireTeacherOrCoordinator,
  logActivity
};
