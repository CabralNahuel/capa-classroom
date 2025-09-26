const { google } = require('googleapis');
const logger = require('./logger');

// Requires domain-wide delegation enabled on the service account
// and the following env vars:
// - SERVICE_ACCOUNT_EMAIL
// - SERVICE_ACCOUNT_PRIVATE_KEY (use \n for newlines or load from file and inject)
// - ADMIN_IMPERSONATE_EMAIL (an admin/user in the same Workspace domain)

function getJwtClient() {
  const email = process.env.SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.SERVICE_ACCOUNT_PRIVATE_KEY;
  const impersonate = process.env.ADMIN_IMPERSONATE_EMAIL;

  if (!email || !privateKey || !impersonate) {
    throw new Error('Admin SDK not configured. Missing SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY/ADMIN_IMPERSONATE_EMAIL');
  }

  // Fix newline escaping if provided via env
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const scopes = [
    'https://www.googleapis.com/auth/admin.directory.user.readonly',
    'https://www.googleapis.com/auth/admin.directory.user.alias.readonly',
  ];

  const jwt = new google.auth.JWT({
    email,
    key: privateKey,
    scopes,
    subject: impersonate, // impersonate admin/user in domain
  });

  return jwt;
}

async function getUserById(userKey) {
  try {
    const auth = getJwtClient();
    const admin = google.admin({ version: 'directory_v1', auth });
    const res = await admin.users.get({ userKey });
    return res.data; // { primaryEmail, name, ... }
  } catch (err) {
    logger.warn(`Admin SDK getUserById failed for ${userKey}: ${err.message}`);
    return null;
  }
}

module.exports = {
  getUserById,
};
