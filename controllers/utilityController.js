/**
 * Utility Controller
 * Handles utility endpoints like health checks, graph queries, and authentication
 */

const jwt = require('jsonwebtoken');

/**
 * Health check endpoint
 */
function getHealth(req, res) {
  res.json({ status: 'API is running', date: new Date() });
}

/**
 * Database health check endpoint
 */
async function getDbHealth(req, res, driver) {
  const session = driver.session();
  try {
    // Run a lightweight query
    await session.run('RETURN 1');
    res.json({ status: 'ok', db: 'available' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unavailable', message: 'Database is not reachable' });
  } finally {
    await session.close();
  }
}

/**
 * Login endpoint
 */
async function login(req, res, userModel, auditLogger, jwtSecret) {
  const { email, password } = req.body;
  if (!email || !password) {
    await auditLogger.log(req, {
      action: 'auth.login_attempt',
      resourceType: 'auth',
      resourceId: email || null,
      success: false,
      message: 'Missing credentials'
    });
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = await userModel.getUserByEmail(email);
  if (!user) {
    await auditLogger.log(req, {
      action: 'auth.login_failure',
      resourceType: 'auth',
      resourceId: email,
      success: false,
      message: 'User not found',
      details: { email }
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await userModel.verifyUserPassword(email, password);
  if (!valid) {
    await auditLogger.log(req, {
      action: 'auth.login_failure',
      resourceType: 'auth',
      resourceId: email,
      success: false,
      message: 'Invalid password',
      targetUserId: email
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // Create a simple JWT token
  const token = jwt.sign({ email: user.email, name: user.name, roles: user.roles }, jwtSecret, { expiresIn: '8h' });
  await auditLogger.log(req, {
    action: 'auth.login_success',
    resourceType: 'user',
    resourceId: user.email,
    success: true,
    actorOverride: {
      userId: user.email,
      userName: user.name,
      roles: Array.isArray(user.roles) ? user.roles : [user.roles].filter(Boolean)
    },
    details: { roles: user.roles || [] }
  });
  res.json({ success: true, token });
}

/**
 * Create admin user endpoint
 */
async function createAdmin(req, res, userModel, auditLogger) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    await auditLogger.log(req, {
      action: 'user.create_admin',
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
    await auditLogger.log(req, {
      action: 'user.create_admin',
      resourceType: 'user',
      resourceId: email,
      success: false,
      message: 'User already exists',
      details: { existing: true }
    });
    return res.status(409).json({ error: 'User already exists' });
  }
  user = { id: email, name, email, roles: ['admin'], password };
  await userModel.createUser(user);
  await auditLogger.log(req, {
    action: 'user.create_admin',
    resourceType: 'user',
    resourceId: email,
    success: true,
    targetUserId: email,
    targetUserName: name,
    details: { roles: ['admin'] }
  });
  res.json({ success: true, user: { name, email, roles: ['admin'] } });
}

/**
 * General file upload endpoint
 */
function uploadFile(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ filename: req.file.filename, originalname: req.file.originalname, path: req.file.path });
}

/**
 * Admin check endpoint
 */
function checkAdmin(req, res) {
  res.json({ message: 'You are an admin!', user: req.user });
}

/**
 * Graph Cypher query endpoint
 */
async function graphCypher(req, res, driver, neo4jDatabase) {
  console.log('[graph-cypher] Request received');
  const { cypher, params } = req.body || {};
  console.log('[graph-cypher] Cypher query:', cypher);
  if (!cypher) {
    console.log('[graph-cypher] Missing cypher query');
    return res.status(400).json({ error: 'Missing cypher query' });
  }
  
  let session = driver.session({ database: neo4jDatabase });
  try {
    const result = await session.run(cypher, params || {});
    // Extract nodes and relationships for visualization
    const nodes = {};
    const relationships = {};
    result.records.forEach(record => {
      record.forEach(val => {
        if (val && val.identity && val.labels) {
          // Node
          nodes[val.identity.toString()] = val.properties;
          nodes[val.identity.toString()]._id = val.identity.toString();
          nodes[val.identity.toString()]._labels = val.labels;
        } else if (val && val.identity && val.type) {
          // Relationship
          relationships[val.identity.toString()] = {
            id: val.identity.toString(),
            type: val.type,
            start: val.start.toString(),
            end: val.end.toString(),
            properties: val.properties
          };
        }
      });
    });
    res.json({ nodes: Object.values(nodes), relationships: Object.values(relationships) });
  } catch (err) {
    // If database doesn't exist, try default 'neo4j' database
    if (err.message && err.message.includes('Database does not exist')) {
      console.log(`[graph-cypher] Database '${neo4jDatabase}' does not exist. Trying 'neo4j' instead...`);
      await session.close();
      session = driver.session({ database: 'neo4j' });
      try {
        const result = await session.run(cypher, params || {});
        const nodes = {};
        const relationships = {};
        result.records.forEach(record => {
          record.forEach(val => {
            if (val && val.identity && val.labels) {
              nodes[val.identity.toString()] = val.properties;
              nodes[val.identity.toString()]._id = val.identity.toString();
              nodes[val.identity.toString()]._labels = val.labels;
            } else if (val && val.identity && val.type) {
              relationships[val.identity.toString()] = {
                id: val.identity.toString(),
                type: val.type,
                start: val.start.toString(),
                end: val.end.toString(),
                properties: val.properties
              };
            }
          });
        });
        res.json({ nodes: Object.values(nodes), relationships: Object.values(relationships) });
      } catch (retryErr) {
        console.error('[graph-cypher] Error with fallback database:', retryErr);
        res.status(500).json({ error: retryErr.message, details: 'Failed to execute query even with fallback database' });
      }
    } else {
      console.error('[graph-cypher] Error:', err);
      res.status(500).json({ error: err.message, details: 'Failed to execute Cypher query' });
    }
  } finally {
    if (session) {
      await session.close();
    }
  }
}

module.exports = {
  getHealth,
  getDbHealth,
  login,
  graphCypher,
  createAdmin,
  uploadFile,
  checkAdmin
};

