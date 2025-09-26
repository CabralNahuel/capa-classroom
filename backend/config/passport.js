const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { query } = require('./database');
const logger = require('../utils/logger');

// Configure Google OAuth strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:5000/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const { id: googleId, emails, displayName, photos } = profile;
    const email = emails[0].value;
    const picture = photos[0]?.value;
    const domain = email.split('@')[1];

    // Check if user exists
    let result = await query(
      'SELECT * FROM users WHERE google_id = $1 OR email = $2',
      [googleId, email]
    );

    let user;

    if (result.rows.length > 0) {
      // Update existing user (keep current role)
      user = result.rows[0];
      await query(
        `UPDATE users 
         SET name = $1, picture = $2, email = $3, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [displayName, picture, email, user.id]
      );
      
      user.name = displayName;
      user.picture = picture;
      user.email = email;
    } else {
      // Create new user with DEFAULT role 'student'
      const role = determineUserRole(email, domain); // returns 'student'
      
      result = await query(
        `INSERT INTO users (google_id, email, name, picture, role, domain, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         RETURNING *`,
        [googleId, email, displayName, picture, role, domain]
      );
      
      user = result.rows[0];
      logger.info(`New user created: ${email} with role: ${role}`);
    }

    // Store or update tokens
    await query(
      `INSERT INTO user_sessions (user_id, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
       access_token = $2, refresh_token = $3, token_expires_at = $4, updated_at = CURRENT_TIMESTAMP`,
      [
        user.id,
        accessToken,
        refreshToken,
        new Date(Date.now() + 3600000) // 1 hour from now
      ]
    );

    return done(null, user);
  } catch (error) {
    logger.error('Google OAuth error:', error);
    return done(error, null);
  }
}));

// Determine user role based on email and domain
function determineUserRole(email, domain) {
  // Política actual: todo usuario nuevo comienza como 'student'.
  // Los ascensos a 'teacher' o 'coordinator' los gestiona el Panel de Coordinación.
  return 'student';
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query(
      'SELECT id, google_id, email, name, picture, role, domain FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length > 0) {
      done(null, result.rows[0]);
    } else {
      done(new Error('User not found'), null);
    }
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
