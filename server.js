// ...existing code...
// ...existing code...
// ...existing code...
// New EJS routes (moved below app initialization)
// (Moved below app initialization)
const express = require('express');
const cookieParser = require('cookie-parser');
const neo4j = require('neo4j-driver');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

require('dotenv').config();


const upload = require('./fileUpload');
const app = express();
app.use(cookieParser());

// Removed EJS and express-ejs-layouts setup. Static HTML only.



// Secure all HTML pages except login.html
// Serve static assets (css, js, images) publicly
app.use((req, res, next) => {
  if (
    req.path.endsWith('.css') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.png') ||
    req.path.endsWith('.jpg') ||
    req.path.endsWith('.jpeg') ||
    req.path.endsWith('.svg') ||
    req.path.endsWith('.ico') ||
    req.path.startsWith('/uploads')
  ) {
    return express.static('express-frontend/public')(req, res, next);
  }
  next();
});

// Serve login.html publicly
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'express-frontend', 'public', 'login.html'));
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// Secure all other HTML pages
app.get('/*.html', (req, res) => {
  const cookieToken = req.cookies && req.cookies.token;
  const headerToken = req.headers['authorization'];
  console.log('DEBUG: cookie token:', cookieToken);
  console.log('DEBUG: header token:', headerToken);
  const auth = headerToken || cookieToken;
  if (!auth) {
    console.log('DEBUG: No token found, redirecting to login');
    return res.redirect('/login.html');
  }
  let token = auth;
  if (auth && auth.startsWith('Bearer ')) {
    token = auth.split(' ')[1];
  }
  try {
    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('DEBUG: Token verified, user:', decoded);
    res.sendFile(path.join(__dirname, 'express-frontend', 'public', req.path));
  } catch (err) {
    console.log('DEBUG: Token verification failed:', err.message);
    return res.redirect('/login.html');
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// JWT authentication middleware (must be defined before any route uses it)
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'No token provided' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

// Create an admin user with password
app.post('/api/create-admin', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
  let user = await userModel.getUserByEmail(email);
  if (user) return res.status(409).json({ error: 'User already exists' });
  user = { id: email, name, email, roles: ['admin'], password };
  await userModel.createUser(user);
  res.json({ success: true, user: { name, email, roles: ['admin'] } });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await userModel.getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await userModel.verifyUserPassword(email, password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  // Create a simple JWT token
  const token = jwt.sign({ email: user.email, name: user.name, roles: user.roles }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token });
});
const PORT = process.env.PORT || 5000;

app.get('/allcases', (req, res) => {
  res.render('allcases', { title: 'All Cases - Missing Persons App' });
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'express-frontend', 'views'));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Graph visualization Cypher proxy endpoint
app.post('/api/graph-cypher', async (req, res) => {
  const { cypher, params } = req.body || {};
  if (!cypher) return res.status(400).json({ error: 'Missing cypher query' });
  const session = driver.session();
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
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});


// No Azure AD, only local login


// Neo4j connection
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);


// User model setup
const UserModel = require('./userModel');
const userModel = new UserModel(driver);

// CaseEvent model setup
const CaseEventModel = require('./caseEventModel');
const caseEventModel = new CaseEventModel(driver);




// JWT authentication middleware
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'No token provided' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Role-based access middleware
function requireRole(role) {
  return (req, res, next) => {
    const roles = req.user && (req.user.roles || req.user.groups || req.user.roles_claim || []);
    if (Array.isArray(roles) && roles.includes(role)) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  };
}


// Get all communities
app.get('/api/communities', async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (c:Community) RETURN c ORDER BY c.name');
    const communities = result.records.map(r => r.get('c').properties);
    res.json({ communities });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch communities' });
  } finally {
    await session.close();
  }
});

  // --- Organization Management Endpoints ---
  // Create a new organization
  app.post('/api/organizations', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, contact, phone } = req.body;
    console.log('POST /api/organizations called with:', req.body);
    if (!name) {
      console.log('Organization creation failed: Name is required');
      return res.status(400).json({ error: 'Name is required' });
    }
    const session = driver.session();
    try {
      // Check for duplicate (active or inactive)
      const exists = await session.run('MATCH (o:Organization {name: $name}) RETURN o', { name });
      if (exists.records.length) {
        // If org exists and is inactive, reactivate and update info
        const org = exists.records[0].get('o').properties;
        if (org.active === false) {
          await session.run('MATCH (o:Organization {name: $name}) SET o.active = true, o.contact = $contact, o.phone = $phone', { name, contact, phone });
          console.log('Organization reactivated:', name, contact, phone);
          await session.close();
          return res.json({ success: true, reactivated: true });
        }
        console.log('Organization creation failed: Duplicate name');
        await session.close();
        return res.status(409).json({ error: 'Organization already exists' });
      }
      await session.run('CREATE (o:Organization {name: $name, contact: $contact, phone: $phone, active: true})', { name, contact, phone });
      console.log('Organization created:', name, contact, phone);
      await session.close();
      res.json({ success: true });
    } catch (err) {
      console.error('Error creating organization:', err);
      await session.close();
      res.status(500).json({ error: 'Failed to create organization', details: err.message });
    }
  });

  // List all organizations
  app.get('/api/organizations', authMiddleware, async (req, res) => {
    console.log('GET /api/organizations called');
    const session = driver.session();
    try {
  const result = await session.run('MATCH (o:Organization) WHERE o.active IS NULL OR o.active = true RETURN o ORDER BY o.name');
  const organizations = result.records.map(r => r.get('o').properties);
      console.log('Organizations returned:', organizations.length);
      await session.close();
      res.json({ organizations });
    } catch (err) {
      console.error('Error fetching organizations:', err);
      await session.close();
      res.status(500).json({ error: 'Failed to fetch organizations', details: err.message });
    }
  });

// Soft delete organization
app.delete('/api/organizations', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  console.log('DELETE /api/organizations called with:', req.body);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const session = driver.session();
  try {
    // Log all org names for debugging
    const allOrgs = await session.run('MATCH (o:Organization) RETURN o.name');
    console.log('Existing organizations:', allOrgs.records.map(r => r.get('o.name')));
    // Set active to false instead of deleting
    const result = await session.run('MATCH (o:Organization {name: $name}) SET o.active = false RETURN o', { name });
    if (result.summary.counters.updates().propertiesSet > 0) {
      console.log('Organization soft-deleted:', name);
      res.json({ success: true });
    } else {
      console.log('Organization not found for delete:', name);
      res.status(404).json({ error: 'Organization not found' });
    }
  } catch (err) {
    console.error('Error in DELETE /api/organizations:', err);
    res.status(500).json({ error: 'Failed to delete organization' });
  } finally {
    await session.close();
  }
});
// Public test route
app.get('/api/health', (req, res) => {
  res.json({ status: 'API is running', date: new Date() });
});

// Health check for Neo4j DB
app.get('/api/health/db', async (req, res) => {
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
});
// Get applicant info by ID (for case notes page)
// Enhanced: Also return referring organization (even if soft deleted)
app.get('/api/applicants/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const session = driver.session();
    // Get applicant, referring org, and related LovedOne(s)
    const result = await session.run(
      `MATCH (a:Applicant {id: $id})
       OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
       OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
       RETURN a, o, collect({lovedOne: l, relationship: rel.relationship}) AS lovedOnes`,
      { id }
    );
    await session.close();
    if (!result.records.length) return res.status(404).json({ error: 'Not found' });
    const applicant = result.records[0].get('a').properties;
    const orgNode = result.records[0].get('o');
    const referringOrg = orgNode ? orgNode.properties : null;
    // lovedOnes is an array of {lovedOne, relationship}
    const lovedOnesRaw = result.records[0].get('lovedOnes');
    const lovedOnes = lovedOnesRaw
      .filter(lo => lo.lovedOne)
      .map(lo => ({
        ...lo.lovedOne.properties,
        relationship: lo.relationship || ''
      }));
    res.json({ applicant, referringOrg, lovedOnes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applicant' });
  }
});


// authMiddleware is now always JWT-based


// Get cases assigned to the logged-in user (case worker or admin)
app.get('/api/my-cases', authMiddleware, async (req, res) => {
  const userEmail = req.user && (req.user.email || req.user.preferred_username);
  if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });
  const session = driver.session();
  try {
    // Find applicants assigned to this user (correct direction)
    const result = await session.run(
      'MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant) RETURN a',
      { email: userEmail }
    );
    const cases = result.records.map(r => r.get('a').properties);
    res.json({ cases });
  } catch (err) {
    console.error('Failed to fetch my cases:', err);
    res.status(500).json({ error: 'Failed to fetch cases' });
  } finally {
    await session.close();
  }
});
// Admin-only route example
app.get('/api/admin',
  authMiddleware,
  requireRole('admin'),
  (req, res) => {
    res.json({ message: 'You are an admin!', user: req.user });
  }
);


// Get current user info (from token)
app.get('/api/me', authMiddleware, async (req, res) => {
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
});


// List all users (admin only)
app.get('/api/users',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const users = await userModel.getAllUsers();
    res.json({ users });
  }
);


// Create a new user (admin only)
app.post('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, email, password, roles } = req.body;
  console.log('Attempting to create user:', { name, email, roles });
  if (!name || !email || !password || !roles) {
    console.error('Missing required fields for user creation');
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let user = await userModel.getUserByEmail(email);
  if (user) {
    console.warn('User already exists:', email);
    return res.status(409).json({ error: 'User already exists' });
  }
  user = { id: email, name, email, password, roles };
  try {
    await userModel.createUser(user);
    console.log('User created successfully:', user);
    res.json({ success: true, user });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});
// Assign a case (Applicant) to a case worker (admin only)
app.post('/api/cases/:caseId/assign', authMiddleware, requireRole('admin'), async (req, res) => {
  const { caseId } = req.params;
  const { email } = req.body; // case worker email
  console.log('Assigning case', caseId, 'to user', email);
  if (!caseId || !email) {
    console.error('Missing caseId or email for assignment');
    return res.status(400).json({ error: 'Missing caseId or email' });
  }
  const session = driver.session();
  try {
    // Remove all existing ASSIGNED_TO relationships for this case
    await session.run(
      `MATCH (u:User)-[r:ASSIGNED_TO]->(a:Applicant {id: $caseId}) DELETE r`,
      { caseId }
    );
    // Create new assignment
    await session.run(
      `MATCH (a:Applicant {id: $caseId}), (u:User {email: $email}) MERGE (u)-[:ASSIGNED_TO]->(a)`,
      { caseId, email }
    );
    console.log('Case assigned successfully');
    res.json({ success: true });
  } catch (err) {
    console.error('Assignment failed:', err);
    res.status(500).json({ error: 'Assignment failed' });
  } finally {
    await session.close();
  }
});

// List cases assigned to a case worker
app.get('/api/case-worker/:email/cases', authMiddleware, async (req, res) => {
  const { email } = req.params;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant) RETURN a`,
      { email }
    );
    const cases = result.records.map(r => r.get('a').properties);
    res.json({ cases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assigned cases' });
  } finally {
    await session.close();
  }
});


// Update user roles (admin only)
app.put('/api/users/:email/roles',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const { email } = req.params;
    const { roles } = req.body;
    await userModel.updateUserRoles(email, roles);
    res.json({ success: true });
  }
);


// Promote user to admin
app.post('/api/users/:email/promote',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const { email } = req.params;
    const user = await userModel.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.includes('admin')) roles.push('admin');
    await userModel.updateUserRoles(email, roles);
    res.json({ success: true, roles });
  }
);


// Demote user to case_worker (removes admin role)
app.post('/api/users/:email/demote',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const { email } = req.params;
    const user = await userModel.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    let roles = Array.isArray(user.roles) ? user.roles : [];
    roles = roles.filter(r => r !== 'admin');
    if (!roles.includes('case_worker')) roles.push('case_worker');
    await userModel.updateUserRoles(email, roles);
    res.json({ success: true, roles });
  }
);


// Delete user (admin only)
app.delete('/api/users/:email',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const { email } = req.params;
    // Remove user node from Neo4j
    const session = driver.session();
    try {
      await session.run('MATCH (u:User {email: $email}) DETACH DELETE u', { email });
      res.json({ success: true });
    } finally {
      await session.close();
    }
  }
);


// View audit logs (stub)
app.get('/api/audit-logs',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    // TODO: Implement audit log storage and retrieval
    res.json({ logs: [], message: 'Audit log feature coming soon.' });
  }
);


// Add event to a case (case worker or admin)
app.post('/api/cases/:caseId/events',
  authMiddleware,
  (req, res, next) => {
    // Only allow 'admin' or 'case_worker' roles
    const roles = req.user && (req.user.roles || req.user.groups || []);
    if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  },
  async (req, res) => {
    const { caseId } = req.params;
    const event = {
      type: req.body.type,
      description: req.body.description,
      timestamp: req.body.timestamp,
      user: req.user.preferred_username || req.user.email
    };
    const created = await caseEventModel.addEvent(caseId, event);
    res.json({ event: created });
  }
);


// List all events for a case (any authenticated user)
app.get('/api/cases/:caseId/events',
  authMiddleware,
  async (req, res) => {
    const { caseId } = req.params;
    const events = await caseEventModel.getEvents(caseId);
    res.json({ events });
  }
);


// File upload route (case worker or admin)
// Upload a file to a specific case

// List files for a specific case
// Delete a file from a case
const fs = require('fs');
app.delete('/api/cases/:caseId/files/:filename', authMiddleware, async (req, res) => {
  const { caseId, filename } = req.params;
  const session = driver.session();
  try {
    // Find and delete File node and relationship
    await session.run(
      `MATCH (a:Applicant {id: $caseId})-[:HAS_FILE]->(f:File {filename: $filename})
       DETACH DELETE f`,
      { caseId, filename }
    );
    // Delete file from disk
    const filePath = require('path').join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  } finally {
    await session.close();
  }
});
app.get('/api/cases/:caseId/files', authMiddleware, async (req, res) => {
  const { caseId } = req.params;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Applicant {id: $caseId})-[:HAS_FILE]->(f:File)
       RETURN f ORDER BY f.uploadedAt DESC`,
      { caseId }
    );
    const files = result.records.map(r => r.get('f').properties);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch files' });
  } finally {
    await session.close();
  }
});
app.post('/api/cases/:caseId/upload',
  authMiddleware,
  (req, res, next) => {
    // Only allow 'admin' or 'case_worker' roles
    const roles = req.user && (req.user.roles || req.user.groups || []);
    if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  },
  upload.single('file'),
  async (req, res) => {
    const { caseId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const session = driver.session();
    try {
      // Save file metadata and link to case
      const fileMeta = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user.email || req.user.name,
        uploadedAt: new Date().toISOString()
      };
      // Create File node and link to Applicant (case)

      await session.run(
        `MATCH (a:Applicant {id: $id})
        CREATE (f:File {filename: $filename, originalname: $originalname, path: $path, mimetype: $mimetype, size: $size, uploadedBy: $uploadedBy, uploadedAt: $uploadedAt})
        CREATE (a)-[:HAS_FILE]->(f)`,
        { id: caseId, ...fileMeta }
      );

      // Add a CaseEvent for the file upload
      const eventId = require('uuid').v4();
      await session.run(
        `MATCH (a:Applicant {id: $id})
         CREATE (e:CaseEvent {
           eventId: $eventId,
           type: 'file_upload',
           description: $description,
           timestamp: $timestamp,
           user: $user,
           filename: $filename,
           originalname: $originalname
         })
         CREATE (a)-[:HAS_EVENT]->(e)`,
        {
          id: caseId,
          eventId,
          description: `File '${fileMeta.originalname}' uploaded by ${fileMeta.uploadedBy}`,
          timestamp: fileMeta.uploadedAt,
          user: fileMeta.uploadedBy,
          filename: fileMeta.filename,
          originalname: fileMeta.originalname
        }
      );

      res.json({ success: true, file: fileMeta });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save file metadata' });
    } finally {
      await session.close();
    }
  }
);
app.post('/api/upload',
  authMiddleware,
  (req, res, next) => {
    // Only allow 'admin' or 'case_worker' roles
    const roles = req.user && (req.user.roles || req.user.groups || []);
    if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  },
  upload.single('file'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ filename: req.file.filename, originalname: req.file.originalname, path: req.file.path });
  }
);


// List all cases (applicants) for all users
app.get('/api/cases', authMiddleware, async (req, res) => {
  const session = driver.session();
  try {
    // Get all applicants and who they are assigned to
    const result = await session.run(`
      MATCH (a:Applicant)
      OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
      RETURN a, collect(u.email) AS assignedTo
    `);
    const cases = result.records.map(r => {
      const a = r.get('a').properties;
      a.assignedTo = r.get('assignedTo').filter(e => !!e);
      return a;
    });
    res.json({ cases });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cases' });
  } finally {
    await session.close();
  }
});

// Intake form submission endpoint
app.post('/api/intake', authMiddleware, async (req, res) => {
  try {
    const data = req.body;
    const staff = req.user.name || req.user.email || '';
    const session = driver.session();
    // Generate a unique id for the applicant (e.g., A + timestamp)
    const applicantId = 'A' + Date.now();
    // Create Applicant node with id
    const applicantResult = await session.run(
      `CREATE (a:Applicant {id: $id, name: $name, kinshipRole: $kinshipRole, contact: $contact, email: $email, address: $address, language: $language, community: $community, contactTime: $contactTime, staff: $staff}) RETURN a`,
      {
        id: applicantId,
        name: data.applicantName || '',
        kinshipRole: data.kinshipRole || '',
        contact: data.contact || '',
        email: data.email || '',
        address: data.address || '',
        language: data.language || '',
        community: data.community || '',
        contactTime: data.contactTime || '',
        staff
      }
    );
    // Create LovedOne node if provided
    let lovedOneNode = null;
    if (data.lovedOneName || data.relationship) {
      const lovedOneResult = await session.run(
        `CREATE (l:LovedOne {name: $name, dateOfIncident: $dateOfIncident, lastLocation: $lastLocation}) RETURN l`,
        {
          name: data.lovedOneName || '',
          dateOfIncident: data.incidentDate || '',
          lastLocation: data.lastLocation || ''
        }
      );
      lovedOneNode = lovedOneResult.records[0]?.get('l');
      // Create relationship
      await session.run(
        `MATCH (a:Applicant {email: $email}), (l:LovedOne {name: $lovedOneName}) CREATE (a)-[:RELATED_TO {relationship: $relationship}]->(l)`,
        {
          email: data.email || '',
          lovedOneName: data.lovedOneName || '',
          relationship: data.relationship || ''
        }
      );
    }
    // Add support services as nodes and relationships
    if (Array.isArray(data.support)) {
      for (const type of data.support) {
        await session.run(
          `MERGE (s:SupportService {type: $type}) WITH s MATCH (a:Applicant {email: $email}) MERGE (a)-[:REQUESTED]->(s)`,
          { type, email: data.email || '' }
        );
      }
    }
    // Add notes as a property on Applicant
    if (data.notes) {
      await session.run(
        `MATCH (a:Applicant {email: $email}) SET a.notes = $notes`,
        { email: data.email || '', notes: data.notes }
      );
    }
    // Create REFERRED_BY relationship if referringOrganization is provided
    if (data.referringOrganization) {
      await session.run(
        `MATCH (a:Applicant {id: $id}), (o:Organization {name: $orgName}) MERGE (a)-[:REFERRED_BY]->(o)`,
        { id: applicantId, orgName: data.referringOrganization }
      );
    }
    await session.close();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save intake form.' });
  }
});

// Start server
app.listen(PORT, () => {
  // Set Windows CMD window title
  process.stdout.write(`\x1b]2;Missing Persons App - Port ${PORT}\x07`);
  console.log('========================================');
  console.log('   Missing Persons App Server Started');
  console.log(`   Listening on port: ${PORT}`);
  console.log('========================================');
});

// Export for testing
// --- CASE NOTES ENDPOINTS ---
// Get notes for a case (as Note nodes)
app.get('/api/cases/:caseId/notes', authMiddleware, async (req, res) => {
  const { caseId } = req.params;
  const user = req.user;
  try {
    const session = driver.session();
    let canView = false;
    if (user.roles && user.roles.includes('admin')) {
      canView = true;
    } else {
      const result = await session.run('MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a', { caseId, email: user.email || user.preferred_username });
      canView = result.records.length > 0;
    }
    if (!canView) {
      await session.close();
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Fetch related Note nodes
    const notesResult = await session.run('MATCH (a:Applicant {id: $caseId})-[:HAS_NOTE]->(n:Note) RETURN n ORDER BY n.timestamp', { caseId });
    const notes = notesResult.records.map(r => r.get('n').properties);
    await session.close();
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// Add a note to a case (as Note node)
app.post('/api/cases/:caseId/notes', authMiddleware, async (req, res) => {
  const { caseId } = req.params;
  const { text } = req.body;
  const user = req.user;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Note text required' });
  try {
    const session = driver.session();
    let canEdit = false;
    if (user.roles && user.roles.includes('admin')) {
      canEdit = true;
    } else {
      const result = await session.run('MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a', { caseId, email: user.email || user.preferred_username });
      canEdit = result.records.length > 0;
    }
    if (!canEdit) {
      await session.close();
      return res.status(403).json({ error: 'Not authorized' });
    }
    const timestamp = new Date().toISOString();
    // Create Note node and relate to Applicant
    await session.run('MATCH (a:Applicant {id: $caseId}) CREATE (n:Note {text: $text, author: $author, timestamp: $timestamp}) CREATE (a)-[:HAS_NOTE]->(n)', {
      caseId,
      text,
      author: user.name || user.email || user.preferred_username,
      timestamp
    });
    await session.close();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Unassign all case workers from a case (remove all ASSIGNED_TO relationships for a given Applicant id)
app.post('/api/cases/:caseId/unassign', authMiddleware, requireRole('admin'), async (req, res) => {
  const { caseId } = req.params;
  console.log('[DEBUG] Unassign request received for caseId:', caseId);
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User)-[r:ASSIGNED_TO]->(a:Applicant {id: $caseId}) DELETE r RETURN COUNT(r) AS deletedCount`,
      { caseId }
    );
    const deletedCount = result.records.length > 0 ? result.records[0].get('deletedCount').toInt() : 0;
    console.log('[DEBUG] Unassign result for caseId', caseId, ': deletedCount =', deletedCount);
    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error('[DEBUG] Unassign error for caseId', caseId, ':', err);
    res.status(500).json({ error: 'Failed to unassign case' });
  } finally {
    await session.close();
  }
});

module.exports = app;
