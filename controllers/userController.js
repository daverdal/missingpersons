/**
 * User Controller
 * Handles all user management operations
 */

/**
 * Get current user info (from token)
 */
async function getCurrentUser(req, res, userModel, auditLogger) {
  // Try to find user in Neo4j, or create if not exists
  const email = req.user.preferred_username || req.user.email;
  let user = await userModel.getUserByEmail(email);
  if (!user) {
    user = {
      id: req.user.oid || req.user.sub,
      name: req.user.name,
      email,
      roles: req.user.roles || req.user.groups || []
    };
    await userModel.createUser(user);
  }
  res.json({ user });
}

/**
 * List all users (admin only)
 */
async function getAllUsers(req, res, userModel, auditLogger) {
  const users = await userModel.getAllUsers();
  res.json({ users });
}

/**
 * Create a new user (admin only)
 */
async function createUser(req, res, userModel, auditLogger) {
  const { name, email, password, roles } = req.body;
  console.log('Attempting to create user:', { name, email, roles });
  if (!name || !email || !password || !roles) {
    console.error('Missing required fields for user creation');
    await auditLogger.log(req, {
      action: 'user.create',
      resourceType: 'user',
      resourceId: email || null,
      success: false,
      message: 'Missing required fields',
      details: { providedFields: Object.keys(req.body || {}) }
    });
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let user = await userModel.getUserByEmail(email);
  if (user) {
    console.warn('User already exists:', email);
    await auditLogger.log(req, {
      action: 'user.create',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'User already exists'
    });
    return res.status(409).json({ error: 'User already exists' });
  }
  user = { id: email, name, email, password, roles };
  try {
    await userModel.createUser(user);
    console.log('User created successfully:', user);
    await auditLogger.log(req, {
      action: 'user.create',
      resourceType: 'user',
      resourceId: email,
      success: true,
      targetUserId: email,
      targetUserName: name,
      details: { roles }
    });
    res.json({ success: true, user });
  } catch (err) {
    console.error('Error creating user:', err);
    await auditLogger.log(req, {
      action: 'user.create',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'Error creating user',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to create user' });
  }
}

/**
 * Update user roles (admin only)
 */
async function updateUserRoles(req, res, userModel, auditLogger) {
  const { email } = req.params;
  const { roles } = req.body;
  try {
    await userModel.updateUserRoles(email, roles);
    await auditLogger.log(req, {
      action: 'user.update_roles',
      resourceType: 'user',
      resourceId: email,
      success: true,
      targetUserId: email,
      details: { roles }
    });
    res.json({ success: true });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'user.update_roles',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'Failed to update roles',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to update roles' });
  }
}

/**
 * Promote user to admin
 */
async function promoteUser(req, res, userModel, auditLogger) {
  const { email } = req.params;
  const user = await userModel.getUserByEmail(email);
  if (!user) {
    await auditLogger.log(req, {
      action: 'user.promote',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'User not found'
    });
    return res.status(404).json({ error: 'User not found' });
  }
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (!roles.includes('admin')) roles.push('admin');
  try {
    await userModel.updateUserRoles(email, roles);
    await auditLogger.log(req, {
      action: 'user.promote',
      resourceType: 'user',
      resourceId: email,
      success: true,
      targetUserId: email,
      details: { roles }
    });
    res.json({ success: true, roles });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'user.promote',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'Failed to update roles',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to update roles' });
  }
}

/**
 * Demote user to case_worker (removes admin role)
 */
async function demoteUser(req, res, userModel, auditLogger) {
  const { email } = req.params;
  const user = await userModel.getUserByEmail(email);
  if (!user) {
    await auditLogger.log(req, {
      action: 'user.demote',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'User not found'
    });
    return res.status(404).json({ error: 'User not found' });
  }
  let roles = Array.isArray(user.roles) ? user.roles : [];
  roles = roles.filter(r => r !== 'admin');
  if (!roles.includes('case_worker')) roles.push('case_worker');
  try {
    await userModel.updateUserRoles(email, roles);
    await auditLogger.log(req, {
      action: 'user.demote',
      resourceType: 'user',
      resourceId: email,
      success: true,
      targetUserId: email,
      details: { roles }
    });
    res.json({ success: true, roles });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'user.demote',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'Failed to update roles',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to update roles' });
  }
}

/**
 * Delete user (admin only)
 */
async function deleteUser(req, res, driver, auditLogger) {
  const { email } = req.params;
  // Remove user node from Neo4j
  const session = driver.session();
  try {
    await session.run('MATCH (u:User {email: $email}) DETACH DELETE u', { email });
    await auditLogger.log(req, {
      action: 'user.delete',
      resourceType: 'user',
      resourceId: email,
      success: true,
      targetUserId: email
    });
    res.json({ success: true });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'user.delete',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'Failed to delete user',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to delete user' });
  } finally {
    await session.close();
  }
}

/**
 * Get user preferences
 */
async function getUserPreferences(req, res, userModel, auditLogger) {
  const email = req.user.preferred_username || req.user.email;
  try {
    const preferences = await userModel.getUserPreferences(email);
    res.json({ preferences: preferences || {} });
  } catch (err) {
    console.error('Error fetching user preferences:', err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
}

/**
 * Update user preferences
 * Merges new preferences with existing ones (doesn't overwrite other preferences)
 */
async function updateUserPreferences(req, res, userModel, auditLogger) {
  const email = req.user.preferred_username || req.user.email;
  const { preferences } = req.body;
  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({ error: 'Invalid preferences object' });
  }
  try {
    // Get existing preferences and merge with new ones
    const existing = await userModel.getUserPreferences(email) || {};
    const merged = { ...existing, ...preferences };
    await userModel.updateUserPreferences(email, merged);
    await auditLogger.log(req, {
      action: 'user.update_preferences',
      resourceType: 'user',
      resourceId: email,
      success: true,
      targetUserId: email
    });
    res.json({ success: true, preferences: merged });
  } catch (err) {
    console.error('Error updating user preferences:', err);
    await auditLogger.log(req, {
      action: 'user.update_preferences',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'Failed to update preferences',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
}

module.exports = {
  getCurrentUser,
  getAllUsers,
  createUser,
  updateUserRoles,
  promoteUser,
  demoteUser,
  deleteUser,
  getUserPreferences,
  updateUserPreferences
};

