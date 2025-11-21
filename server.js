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
const smsService = require('./smsService');
const AuditLogModel = require('./auditLogModel');
const AuditLogger = require('./auditLogger');
const offenderNews = require('./modules/offender-news');
const NewsModel = require('./newsModel');
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

function resolveAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

// JWT authentication middleware (must be defined before any route uses it)
function authMiddleware(req, res, next) {
  const token = resolveAuthToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });
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
});

// Login endpoint
app.post('/api/login', async (req, res) => {
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
  const token = jwt.sign({ email: user.email, name: user.name, roles: user.roles }, JWT_SECRET, { expiresIn: '8h' });
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
  const session = driver.session({ database: NEO4J_DATABASE });
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

// List Loved Ones that have coordinates (admin and case_worker)
app.get('/api/loved-ones/with-coordinates', authMiddleware, async (req, res) => {
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAllowed = roles.includes('admin') || roles.includes('case_worker');
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (l:LovedOne)<-[rel:RELATED_TO]-(a:Applicant)
       WHERE l.lastLocationLat IS NOT NULL AND l.lastLocationLon IS NOT NULL
       RETURN l, a, rel.relationship AS relationship
       ORDER BY coalesce(l.dateOfIncident, ''), l.name`
    );
    const results = result.records.map(r => ({
      lovedOne: r.get('l').properties,
      applicant: r.get('a').properties,
      relationship: r.get('relationship') || ''
    }));
    res.json({ results });
  } catch (err) {
    console.error('Failed to fetch loved ones with coordinates:', err);
    res.status(500).json({ error: 'Failed to fetch locations', details: err.message });
  } finally {
    await session.close();
  }
});


// No Azure AD, only local login


// Neo4j connection
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

console.log(`Connecting to Neo4j at ${NEO4J_URI} as user: ${NEO4J_USER}`);
if (!process.env.NEO4J_PASSWORD) {
  console.warn('WARNING: Using default Neo4j password. Set NEO4J_PASSWORD in .env file for security.');
}

// Neo4j 4.0+ encryption configuration
// For bolt:// (unencrypted), explicitly disable encryption
// For neo4j:// or neo4j+s:// (encrypted), enable encryption
const isEncrypted = NEO4J_URI.startsWith('neo4j://') || NEO4J_URI.startsWith('neo4j+s://');

// Use driver constants if available, otherwise use strings
let encryptionSetting;
try {
  encryptionSetting = isEncrypted ? neo4j.util.ENCRYPTION_ON : neo4j.util.ENCRYPTION_OFF;
} catch (e) {
  // Fallback to string values if constants not available
  encryptionSetting = isEncrypted ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF';
}

const driverConfig = isEncrypted 
  ? {
      encrypted: encryptionSetting,
      trust: 'TRUST_ALL_CERTIFICATES'
    }
  : {
      encrypted: encryptionSetting
    };

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  driverConfig
);

// Default database selection (for Neo4j multi-database setups)
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';


const ConfigModel = require('./configModel');

// User model setup
const UserModel = require('./userModel');
const userModel = new UserModel(driver);

// CaseEvent model setup
const CaseEventModel = require('./caseEventModel');
const caseEventModel = new CaseEventModel(driver);

// News model setup (for offender news, RSS, etc.)
const newsModel = new NewsModel(driver);

// Config model setup (for persisted settings like Offender News email)
const configModel = new ConfigModel(driver);

const AUDIT_LOG_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '730', 10);
const auditLogModel = new AuditLogModel(driver);
const auditLogger = new AuditLogger({
  model: auditLogModel,
  retentionDays: Number.isFinite(AUDIT_LOG_RETENTION_DAYS) ? AUDIT_LOG_RETENTION_DAYS : 730
});

(async function initialiseAuditLogging() {
  try {
    await auditLogModel.ensureIndexes();
    await auditLogModel.cleanupOlderThan(auditLogger.getRetentionCutoffIso());
    console.log('Audit logging initialized successfully');
  } catch (err) {
    if (err.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('========================================');
      console.error('NEO4J AUTHENTICATION FAILED');
      console.error('========================================');
      console.error('The Neo4j credentials are incorrect or the database is not accessible.');
      console.error(`URI: ${NEO4J_URI}`);
      console.error(`User: ${NEO4J_USER}`);
      console.error('Password: ' + (NEO4J_PASSWORD ? '***' : '(not set)'));
      console.error('');
      console.error('To fix this:');
      console.error('1. Ensure Neo4j is running');
      console.error('2. Create a .env file in the project root with:');
      console.error('   NEO4J_URI=bolt://localhost:7687');
      console.error('   NEO4J_USER=neo4j');
      console.error('   NEO4J_PASSWORD=your_actual_password');
      console.error('3. Restart the server');
      console.error('========================================');
    } else {
      console.error('Failed to initialise audit logging', err.message);
    }
  }
})();

const AUDIT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const auditCleanupTimer = setInterval(async () => {
  try {
    await auditLogModel.cleanupOlderThan(auditLogger.getRetentionCutoffIso());
  } catch (err) {
    console.error('Audit log cleanup failed', err);
  }
}, AUDIT_CLEANUP_INTERVAL_MS);
if (auditCleanupTimer.unref) auditCleanupTimer.unref();

const OFFENDER_NEWS_DEFAULT_LIMIT = parseInt(process.env.OFFENDER_NEWS_DEFAULT_LIMIT || '25', 10);
const OFFENDER_NEWS_POLICE_RSS_URL =
  process.env.OFFENDER_NEWS_POLICE_RSS_URL || 'https://feeds.feedburner.com/WinnipegcaNewsReleases';
const OFFENDER_NEWS_MANITOBA_RSS_URL =
  process.env.OFFENDER_NEWS_MANITOBA_RSS_URL || 'https://news.gov.mb.ca/news/index.rss';

// Base email config from environment (used if no override stored)
let offenderNewsEmailConfig = {
  host: process.env.OFFENDER_NEWS_EMAIL_IMAP_HOST || null,
  port: parseInt(process.env.OFFENDER_NEWS_EMAIL_IMAP_PORT || '993', 10),
  secure: process.env.OFFENDER_NEWS_EMAIL_IMAP_SECURE,
  username: process.env.OFFENDER_NEWS_EMAIL_USERNAME || null,
  password: process.env.OFFENDER_NEWS_EMAIL_PASSWORD || null,
  mailbox: process.env.OFFENDER_NEWS_EMAIL_FOLDER || 'INBOX'
};

(async function initialiseOffenderNewsConfig() {
  try {
    const stored = await configModel.get('offender_news_email');
    if (stored && typeof stored === 'object') {
      offenderNewsEmailConfig = {
        ...offenderNewsEmailConfig,
        ...stored
      };
    }
  } catch (err) {
    if (err.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('Failed to load Offender News email config from Neo4j: Authentication failed');
      console.error('This is likely the same Neo4j authentication issue. Please check your .env file.');
    } else {
      console.error('Failed to load Offender News email config from Neo4j', err.message);
    }
  } finally {
    offenderNews.init(app, {
      authMiddleware,
      requireRole,
      auditLogger,
      newsModel,
      smsService,
      caseEventModel,
      configModel,
      config: {
        host: offenderNewsEmailConfig.host,
        port: offenderNewsEmailConfig.port,
        secure: offenderNewsEmailConfig.secure,
        username: offenderNewsEmailConfig.username,
        password: offenderNewsEmailConfig.password,
        mailbox: offenderNewsEmailConfig.mailbox,
        defaultLimit: OFFENDER_NEWS_DEFAULT_LIMIT,
        policeRssUrl: OFFENDER_NEWS_POLICE_RSS_URL,
        manitobaRssUrl: OFFENDER_NEWS_MANITOBA_RSS_URL
      }
    });
  }
})();

// Read-only Offender News configuration for Settings page (admin only)
app.get(
  '/api/offender-news/settings',
  authMiddleware,
  requireRole('admin'),
  (req, res) => {
    res.json({
      emailInbox: offenderNewsEmailConfig,
      rssFeeds: {
        policeRssUrl: OFFENDER_NEWS_POLICE_RSS_URL,
        manitobaRssUrl: OFFENDER_NEWS_MANITOBA_RSS_URL
      },
      matching: {
        keywordProperty: 'Applicant.newsKeywords',
        matchFields: ['NewsItem.title', 'NewsItem.description'],
        caseInsensitive: true,
        notifyOncePerNewsAndKeyword: true
      }
    });
  }
);

// Get email settings (admin only)
// Returns both stored settings and effective settings (what's actually being used)
app.get('/api/email-settings', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const stored = await configModel.get('email_settings') || {};
    
    // Calculate effective settings (what's actually being used for email blasts)
    let effectiveSettings = null;
    let dbSettings = stored;
    
    // Check if stored settings have all required fields
    if (dbSettings && typeof dbSettings === 'object' && 
        dbSettings.smtpHost && dbSettings.smtpUser && dbSettings.smtpPass && dbSettings.emailFrom) {
      effectiveSettings = { ...dbSettings };
    }
    
    // If no complete database settings, try Offender News email config
    if (!effectiveSettings) {
      let emailConfig = {
        host: process.env.OFFENDER_NEWS_EMAIL_IMAP_HOST || null,
        username: process.env.OFFENDER_NEWS_EMAIL_USERNAME || null,
        password: process.env.OFFENDER_NEWS_EMAIL_PASSWORD || null
      };
      
      try {
        const offenderNewsConfig = await configModel.get('offender_news_email');
        if (offenderNewsConfig && typeof offenderNewsConfig === 'object') {
          emailConfig = {
            host: offenderNewsConfig.host || emailConfig.host,
            username: offenderNewsConfig.username || emailConfig.username,
            password: offenderNewsConfig.password || emailConfig.password
          };
        }
      } catch (err) {
        // Ignore errors
      }
      
      // For Gmail, convert IMAP settings to SMTP
      if (emailConfig.host && emailConfig.username && emailConfig.password) {
        effectiveSettings = {
          smtpHost: emailConfig.host.includes('gmail') ? 'smtp.gmail.com' : emailConfig.host.replace('imap', 'smtp'),
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: emailConfig.username,
          smtpPass: '***hidden***', // Don't expose password
          emailFrom: emailConfig.username,
          emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
        };
        
        // Merge in any partial settings from database
        if (dbSettings && typeof dbSettings === 'object') {
          if (dbSettings.emailFrom) effectiveSettings.emailFrom = dbSettings.emailFrom;
          if (dbSettings.emailFromName) effectiveSettings.emailFromName = dbSettings.emailFromName;
          if (dbSettings.emailReplyTo !== undefined) effectiveSettings.emailReplyTo = dbSettings.emailReplyTo;
          if (dbSettings.smtpPort) effectiveSettings.smtpPort = dbSettings.smtpPort;
          if (dbSettings.smtpSecure !== undefined) effectiveSettings.smtpSecure = dbSettings.smtpSecure;
        }
      }
    }
    
    // Fall back to environment variables if still no settings
    if (!effectiveSettings) {
      effectiveSettings = {
        smtpHost: process.env.SMTP_HOST || null,
        smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
        smtpSecure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        smtpUser: process.env.SMTP_USER || null,
        smtpPass: process.env.SMTP_PASS ? '***hidden***' : null,
        emailFrom: process.env.EMAIL_FROM || process.env.SMTP_FROM || null,
        emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
      };
      
      // Merge in any partial settings from database
      if (dbSettings && typeof dbSettings === 'object') {
        if (dbSettings.emailFrom) effectiveSettings.emailFrom = dbSettings.emailFrom;
        if (dbSettings.emailFromName) effectiveSettings.emailFromName = dbSettings.emailFromName;
        if (dbSettings.emailReplyTo !== undefined) effectiveSettings.emailReplyTo = dbSettings.emailReplyTo;
        if (dbSettings.smtpPort) effectiveSettings.smtpPort = dbSettings.smtpPort;
        if (dbSettings.smtpSecure !== undefined) effectiveSettings.smtpSecure = dbSettings.smtpSecure;
      }
    }
    
    // Hide password in stored settings too
    const storedForDisplay = { ...stored };
    if (storedForDisplay.smtpPass) {
      storedForDisplay.smtpPass = '***hidden***';
    }
    
    res.json({ 
      settings: storedForDisplay,
      effective: effectiveSettings,
      source: effectiveSettings === stored ? 'database' : 
              (process.env.OFFENDER_NEWS_EMAIL_USERNAME ? 'offender_news_config' : 'environment')
    });
  } catch (err) {
    console.error('Failed to fetch email settings:', err);
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
});

// Save email settings (admin only)
app.post('/api/email-settings', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const {
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPass,
      emailFrom,
      emailFromName,
      emailReplyTo
    } = req.body || {};

    // Get existing settings to preserve values that aren't being updated
    const existing = await configModel.get('email_settings');
    const existingSettings = existing && typeof existing === 'object' ? existing : {};
    
    // Validate port if provided
    if (smtpPort !== undefined && smtpPort !== null && smtpPort !== '') {
      const portNum = parseInt(smtpPort, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({ error: 'SMTP Port must be a valid port number (1-65535)' });
      }
    }

    // Build settings object, using existing values if not provided
    const settings = {
      smtpHost: smtpHost && String(smtpHost).trim() ? String(smtpHost).trim() : (existingSettings.smtpHost || null),
      smtpPort: smtpPort !== undefined && smtpPort !== null && smtpPort !== '' 
        ? parseInt(smtpPort, 10) 
        : (existingSettings.smtpPort !== undefined ? existingSettings.smtpPort : 587),
      smtpSecure: smtpSecure !== undefined && smtpSecure !== '' && smtpSecure !== null
        ? (smtpSecure === true || smtpSecure === 'true')
        : (existingSettings.smtpSecure !== undefined ? existingSettings.smtpSecure : false),
      smtpUser: smtpUser && String(smtpUser).trim() ? String(smtpUser).trim() : (existingSettings.smtpUser || null),
      emailFrom: emailFrom && String(emailFrom).trim() ? String(emailFrom).trim() : (existingSettings.emailFrom || null),
      emailFromName: emailFromName !== undefined && emailFromName !== null
        ? (emailFromName && String(emailFromName).trim() ? String(emailFromName).trim() : null)
        : (existingSettings.emailFromName !== undefined ? existingSettings.emailFromName : null),
      emailReplyTo: emailReplyTo !== undefined && emailReplyTo !== null
        ? (emailReplyTo && String(emailReplyTo).trim() ? String(emailReplyTo).trim() : null)
        : (existingSettings.emailReplyTo !== undefined ? existingSettings.emailReplyTo : null)
    };

    // Allow partial updates - don't require all fields to be present
    // Validation of required fields will happen when actually sending emails

    // Only update password if provided, otherwise preserve existing
    if (smtpPass && String(smtpPass).trim()) {
      settings.smtpPass = String(smtpPass).trim();
    } else if (existingSettings.smtpPass) {
      settings.smtpPass = existingSettings.smtpPass;
    }
    // Note: Password is not required for partial updates - validation happens when sending emails

    // Save to database
    await configModel.set('email_settings', settings);

    await auditLogger.log(req, {
      action: 'email.settings.update',
      resourceType: 'email_settings',
      success: true,
      details: {
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUser: settings.smtpUser,
        emailFrom: settings.emailFrom
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save email settings:', err);
    await auditLogger.log(req, {
      action: 'email.settings.update',
      resourceType: 'email_settings',
      success: false,
      message: err.message
    });
    res.status(500).json({ error: 'Failed to save email settings' });
  }
});




// JWT authentication middleware
function authMiddleware(req, res, next) {
  const token = resolveAuthToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });
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
    await auditLogger.log(req, {
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: null,
      success: false,
      message: 'Name is required'
    });
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
        await auditLogger.log(req, {
          action: 'organization.reactivate',
          resourceType: 'organization',
          resourceId: name,
          success: true
        });
          return res.json({ success: true, reactivated: true });
        }
        console.log('Organization creation failed: Duplicate name');
        await session.close();
      await auditLogger.log(req, {
        action: 'organization.create',
        resourceType: 'organization',
        resourceId: name,
        success: false,
        message: 'Organization already exists'
      });
        return res.status(409).json({ error: 'Organization already exists' });
      }
      await session.run('CREATE (o:Organization {name: $name, contact: $contact, phone: $phone, active: true})', { name, contact, phone });
      console.log('Organization created:', name, contact, phone);
      await session.close();
    await auditLogger.log(req, {
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: name,
      success: true
    });
      res.json({ success: true });
    } catch (err) {
      console.error('Error creating organization:', err);
      await session.close();
    await auditLogger.log(req, {
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: name,
      success: false,
      message: 'Failed to create organization',
      details: { error: err.message }
    });
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
  // --- Client Status Management Endpoints ---
  // Get all Client statuses
  app.get('/api/client-statuses', authMiddleware, async (req, res) => {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (s:ClientStatus) RETURN s ORDER BY s.name');
      const statuses = result.records.map(r => r.get('s').properties);
      await session.close();
      res.json({ statuses });
    } catch (err) {
      await session.close();
      res.status(500).json({ error: 'Failed to fetch statuses' });
    }
  });

  // Create a new Client status
  app.post('/api/client-statuses', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      await auditLogger.log(req, {
        action: 'clientStatus.create',
        resourceType: 'clientStatus',
        resourceId: null,
        success: false,
        message: 'Name is required'
      });
      return res.status(400).json({ error: 'Name is required' });
    }
    const trimmedName = name.trim();
    const session = driver.session();
    try {
      // Check for duplicate
      const exists = await session.run('MATCH (s:ClientStatus {name: $name}) RETURN s', { name: trimmedName });
      if (exists.records.length) {
        const status = exists.records[0].get('s').properties;
        if (status.active === false) {
          // Reactivate if inactive
          await session.run('MATCH (s:ClientStatus {name: $name}) SET s.active = true', { name: trimmedName });
          await session.close();
          await auditLogger.log(req, {
            action: 'clientStatus.reactivate',
            resourceType: 'clientStatus',
            resourceId: trimmedName,
            success: true
          });
          return res.json({ success: true, reactivated: true });
        }
        await session.close();
        await auditLogger.log(req, {
          action: 'clientStatus.create',
          resourceType: 'clientStatus',
          resourceId: trimmedName,
          success: false,
          message: 'Status already exists'
        });
        return res.status(409).json({ error: 'Status already exists' });
      }
      await session.run('CREATE (s:ClientStatus {name: $name, active: true})', { name: trimmedName });
      await session.close();
      await auditLogger.log(req, {
        action: 'clientStatus.create',
        resourceType: 'clientStatus',
        resourceId: trimmedName,
        success: true
      });
      res.json({ success: true });
    } catch (err) {
      await session.close();
      await auditLogger.log(req, {
        action: 'clientStatus.create',
        resourceType: 'clientStatus',
        resourceId: trimmedName,
        success: false,
        message: err.message
      });
      res.status(500).json({ error: 'Failed to create status' });
    }
  });

  // Delete a Client status (soft delete by setting active: false)
  app.delete('/api/client-statuses', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const trimmedName = name.trim();
    const session = driver.session();
    try {
      // Soft delete by setting active: false
      const result = await session.run(
        'MATCH (s:ClientStatus {name: $name}) SET s.active = false RETURN s',
        { name: trimmedName }
      );
      if (result.records.length === 0) {
        await session.close();
        return res.status(404).json({ error: 'Status not found' });
      }
      await session.close();
      await auditLogger.log(req, {
        action: 'clientStatus.delete',
        resourceType: 'clientStatus',
        resourceId: trimmedName,
        success: true
      });
      res.json({ success: true });
    } catch (err) {
      await session.close();
      await auditLogger.log(req, {
        action: 'clientStatus.delete',
        resourceType: 'clientStatus',
        resourceId: trimmedName,
        success: false,
        message: err.message
      });
      res.status(500).json({ error: 'Failed to delete status' });
    }
  });

  // --- Loved One Status Management Endpoints ---
  // Get all Loved One statuses
  app.get('/api/loved-one-statuses', authMiddleware, async (req, res) => {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (s:LovedOneStatus) RETURN s ORDER BY s.name');
      const statuses = result.records.map(r => r.get('s').properties);
      await session.close();
      res.json({ statuses });
    } catch (err) {
      await session.close();
      res.status(500).json({ error: 'Failed to fetch statuses' });
    }
  });

  // Create a new Loved One status
  app.post('/api/loved-one-statuses', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      await auditLogger.log(req, {
        action: 'lovedOneStatus.create',
        resourceType: 'lovedOneStatus',
        resourceId: null,
        success: false,
        message: 'Name is required'
      });
      return res.status(400).json({ error: 'Name is required' });
    }
    const trimmedName = name.trim();
    const session = driver.session();
    try {
      // Check for duplicate
      const exists = await session.run('MATCH (s:LovedOneStatus {name: $name}) RETURN s', { name: trimmedName });
      if (exists.records.length) {
        const status = exists.records[0].get('s').properties;
        if (status.active === false) {
          // Reactivate if inactive
          await session.run('MATCH (s:LovedOneStatus {name: $name}) SET s.active = true', { name: trimmedName });
          await session.close();
          await auditLogger.log(req, {
            action: 'lovedOneStatus.reactivate',
            resourceType: 'lovedOneStatus',
            resourceId: trimmedName,
            success: true
          });
          return res.json({ success: true, reactivated: true });
        }
        await session.close();
        await auditLogger.log(req, {
          action: 'lovedOneStatus.create',
          resourceType: 'lovedOneStatus',
          resourceId: trimmedName,
          success: false,
          message: 'Status already exists'
        });
        return res.status(409).json({ error: 'Status already exists' });
      }
      await session.run('CREATE (s:LovedOneStatus {name: $name, active: true})', { name: trimmedName });
      await session.close();
      await auditLogger.log(req, {
        action: 'lovedOneStatus.create',
        resourceType: 'lovedOneStatus',
        resourceId: trimmedName,
        success: true
      });
      res.json({ success: true });
    } catch (err) {
      await session.close();
      await auditLogger.log(req, {
        action: 'lovedOneStatus.create',
        resourceType: 'lovedOneStatus',
        resourceId: trimmedName,
        success: false,
        message: err.message
      });
      res.status(500).json({ error: 'Failed to create status' });
    }
  });

  // Delete a Loved One status (soft delete by setting active: false)
  app.delete('/api/loved-one-statuses', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const trimmedName = name.trim();
    const session = driver.session();
    try {
      // Soft delete by setting active: false
      const result = await session.run(
        'MATCH (s:LovedOneStatus {name: $name}) SET s.active = false RETURN s',
        { name: trimmedName }
      );
      if (result.records.length === 0) {
        await session.close();
        return res.status(404).json({ error: 'Status not found' });
      }
      await session.close();
      await auditLogger.log(req, {
        action: 'lovedOneStatus.delete',
        resourceType: 'lovedOneStatus',
        resourceId: trimmedName,
        success: true
      });
      res.json({ success: true });
    } catch (err) {
      await session.close();
      await auditLogger.log(req, {
        action: 'lovedOneStatus.delete',
        resourceType: 'lovedOneStatus',
        resourceId: trimmedName,
        success: false,
        message: err.message
      });
      res.status(500).json({ error: 'Failed to delete status' });
    }
  });

app.delete('/api/organizations', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  console.log('DELETE /api/organizations called with:', req.body);
  if (!name) {
    await auditLogger.log(req, {
      action: 'organization.deactivate',
      resourceType: 'organization',
      resourceId: null,
      success: false,
      message: 'Name is required'
    });
    return res.status(400).json({ error: 'Name is required' });
  }
  const session = driver.session();
  try {
    // Log all org names for debugging
    const allOrgs = await session.run('MATCH (o:Organization) RETURN o.name');
    console.log('Existing organizations:', allOrgs.records.map(r => r.get('o.name')));
    // Set active to false instead of deleting
    const result = await session.run('MATCH (o:Organization {name: $name}) SET o.active = false RETURN o', { name });
    if (result.summary.counters.updates().propertiesSet > 0) {
      console.log('Organization soft-deleted:', name);
      await auditLogger.log(req, {
        action: 'organization.deactivate',
        resourceType: 'organization',
        resourceId: name,
        success: true
      });
      res.json({ success: true });
    } else {
      console.log('Organization not found for delete:', name);
      await auditLogger.log(req, {
        action: 'organization.deactivate',
        resourceType: 'organization',
        resourceId: name,
        success: false,
        message: 'Organization not found'
      });
      res.status(404).json({ error: 'Organization not found' });
    }
  } catch (err) {
    console.error('Error in DELETE /api/organizations:', err);
    await auditLogger.log(req, {
      action: 'organization.deactivate',
      resourceType: 'organization',
      resourceId: name,
      success: false,
      message: 'Failed to deactivate organization',
      details: { error: err.message }
    });
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

// Get all applicants with phone numbers (admin only) - MUST be before /api/applicants/:id route
app.get('/api/applicants/with-phone-numbers', authMiddleware, requireRole('admin'), async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.contact IS NOT NULL AND a.contact <> '' AND a.smsOptIn = true
       RETURN a.id AS id, a.name AS name, a.contact AS contact, a.email AS email, a.smsOptIn AS smsOptIn
       ORDER BY a.name`
    );
    const applicants = result.records.map(r => {
      const id = r.get('id');
      const name = r.get('name');
      const contact = r.get('contact');
      const email = r.get('email');
      return {
        id: id ? String(id) : '',
        name: name ? String(name) : '',
        contact: contact ? String(contact) : '',
        email: email ? String(email) : ''
      };
    });
    res.json({ applicants });
  } catch (err) {
    console.error('Failed to fetch applicants with phone numbers:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to fetch applicants', 
      details: err.message,
      code: err.code
    });
  } finally {
    await session.close();
  }
});

// Get all applicants with email addresses (admin only) - MUST be before /api/applicants/:id route
app.get('/api/applicants/with-email-addresses', authMiddleware, requireRole('admin'), async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.email IS NOT NULL AND a.email <> '' AND a.emailOptIn = true
       RETURN a.id AS id, a.name AS name, a.email AS email, a.contact AS contact, a.emailOptIn AS emailOptIn
       ORDER BY a.name`
    );
    const applicants = result.records.map(r => {
      const id = r.get('id');
      const name = r.get('name');
      const email = r.get('email');
      const contact = r.get('contact');
      return {
        id: id ? String(id) : '',
        name: name ? String(name) : '',
        email: email ? String(email) : '',
        contact: contact ? String(contact) : ''
      };
    });
    res.json({ applicants });
  } catch (err) {
    console.error('Failed to fetch applicants with email addresses:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to fetch applicants', 
      details: err.message,
      code: err.code
    });
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
});
// Assign a case (Applicant) to a case worker (admin only)
app.post('/api/cases/:caseId/assign', authMiddleware, requireRole('admin'), async (req, res) => {
  const { caseId } = req.params;
  const { email } = req.body; // case worker email
  console.log('Assigning case', caseId, 'to user', email);
  if (!caseId || !email) {
    console.error('Missing caseId or email for assignment');
    await auditLogger.log(req, {
      action: 'case.assign',
      resourceType: 'case',
      resourceId: caseId || null,
      success: false,
      message: 'Missing caseId or email',
      details: { caseId, email }
    });
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
    // Log assignment as CaseEvent so it appears in Case Notes
    try {
      const eventId = require('uuid').v4();
      const timestamp = new Date().toISOString();
      await session.run(
        `MATCH (a:Applicant {id: $id})
         OPTIONAL MATCH (u:User {email: $email})
         CREATE (e:CaseEvent {
           eventId: $eventId,
           type: 'assignment',
           description: coalesce('Assigned to advocate ' + u.name, 'Assigned to advocate ' + $email),
           timestamp: $timestamp,
           user: $actor
         })
         CREATE (a)-[:HAS_EVENT]->(e)`,
        {
          id: caseId,
          email,
          eventId,
          timestamp,
          actor: (req.user && (req.user.email || req.user.name || req.user.preferred_username)) || 'system'
        }
      );
    } catch (e) {
      console.warn('Failed to log assignment event for case', caseId, e.message);
    }
    console.log('Case assigned successfully');
    await auditLogger.log(req, {
      action: 'case.assign',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: { assignedTo: email }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Assignment failed:', err);
    await auditLogger.log(req, {
      action: 'case.assign',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Assignment failed',
      details: { error: err.message, assignedTo: email }
    });
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
);


// Promote user to admin
app.post('/api/users/:email/promote',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
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
);


// Demote user to case_worker (removes admin role)
app.post('/api/users/:email/demote',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
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
);


// View audit logs
app.get(
  '/api/audit-logs',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const {
      limit,
      cursor,
      cursorLogId,
      action,
      user,
      resourceType,
      resourceId,
      success,
      from,
      to,
      search
    } = req.query || {};

    const filters = {};
    if (action) filters.action = action;
    if (user) filters.user = user;
    if (resourceType) filters.resourceType = resourceType;
    if (resourceId) filters.resourceId = resourceId;
    if (from) filters.from = from;
    if (to) filters.to = to;
    if (search) filters.search = search;
    if (typeof success === 'string' && success.length > 0) {
      if (success.toLowerCase() === 'true') filters.success = true;
      else if (success.toLowerCase() === 'false') filters.success = false;
    }

    try {
      const result = await auditLogModel.getLogs({
        limit,
        cursor,
        cursorLogId,
        filters
      });
      res.json(result);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

// Real-time audit log stream (Server-Sent Events)
app.get(
  '/api/audit-logs/stream',
  authMiddleware,
  requireRole('admin'),
  (req, res) => {
    auditLogger.addStreamClient(req, res);
    res.write('event: connected\ndata: {}\n\n');
  }
);


// Add event to a case (case worker or admin)
app.post('/api/cases/:caseId/events',
  authMiddleware,
  async (req, res, next) => {
    // Only allow 'admin' or 'case_worker' roles
    const roles = req.user && (req.user.roles || req.user.groups || []);
    if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
      return next();
    }
    await auditLogger.log(req, {
      action: 'case.event_create',
      resourceType: 'case',
      resourceId: req.params?.caseId || null,
      success: false,
      message: 'Forbidden: insufficient role'
    });
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
    try {
      const created = await caseEventModel.addEvent(caseId, event);
      await auditLogger.log(req, {
        action: 'case.event_create',
        resourceType: 'case',
        resourceId: caseId,
        success: true,
        details: {
          type: event.type,
          timestamp: event.timestamp
        }
      });
      res.json({ event: created });
    } catch (err) {
      await auditLogger.log(req, {
        action: 'case.event_create',
        resourceType: 'case',
        resourceId: caseId,
        success: false,
        message: 'Failed to add case event',
        details: { error: err.message, type: event.type }
      });
      res.status(500).json({ error: 'Failed to add event' });
    }
  }
);

// Send an SMS update related to a case
app.post('/api/cases/:caseId/sms', authMiddleware, async (req, res) => {
  if (!smsService.isConfigured()) {
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: req.params?.caseId || null,
      success: false,
      message: 'SMS service not configured'
    });
    return res.status(503).json({ error: 'SMS service is not configured' });
  }
  const { caseId } = req.params;
  const { to, message } = req.body || {};
  const trimmedMessage = (message || '').trim();
  if (!to || !trimmedMessage) {
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Destination number and message are required'
    });
    return res.status(400).json({ error: 'Destination number and message are required' });
  }
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAdmin = roles.includes('admin');
  const userEmail = req.user.email || req.user.preferred_username;
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isAdmin) {
    const session = driver.session();
    try {
      const result = await session.run(
        'MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a',
        { caseId, email: userEmail }
      );
      const isAssigned = result.records.length > 0;
      if (!isAssigned) {
        await auditLogger.log(req, {
          action: 'case.sms_send',
          resourceType: 'case',
          resourceId: caseId,
          success: false,
          message: 'Not authorized to send SMS for this case'
        });
        return res.status(403).json({ error: 'Not authorized to send SMS for this case' });
      }
    } catch (err) {
      console.error('Failed to verify case assignment before sending SMS:', err);
      await auditLogger.log(req, {
        action: 'case.sms_send',
        resourceType: 'case',
        resourceId: caseId,
        success: false,
        message: 'Failed to verify assignment',
        details: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to verify assignment', details: err.message });
    } finally {
      await session.close();
    }
  }

  try {
    const smsResult = await smsService.sendSms({ to, body: trimmedMessage });
    const snippet = trimmedMessage.length > 160 ? `${trimmedMessage.slice(0, 157)}...` : trimmedMessage;
    const description = `SMS sent to ${to}: "${snippet}"`;
    try {
      await caseEventModel.addEvent(caseId, {
        type: 'sms',
        description,
        user: req.user.name || userEmail
      });
    } catch (logErr) {
      console.warn('SMS sent but failed to log case event:', logErr);
    }
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: {
        to,
        messageLength: trimmedMessage.length
      }
    });
    res.json({ success: true, sid: smsResult.sid });
  } catch (err) {
    console.error('Failed to send SMS via Twilio:', err);
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to send SMS',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to send SMS', details: err.message });
  }
});

// List all events for a case (any authenticated user)
app.get('/api/cases/:caseId/events',
  authMiddleware,
  async (req, res) => {
    const { caseId } = req.params;
    const events = await caseEventModel.getEvents(caseId);
    res.json({ events });
  }
);

// Normalize phone number to E.164 format
function normalizePhone(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return '+1' + digits;
  }
  if (digits.length > 0) {
    return '+' + digits;
  }
  return '';
}

// Send SMS blast to all clients with phone numbers (admin only)
app.post('/api/sms-blast', authMiddleware, requireRole('admin'), async (req, res) => {
  if (!smsService.isConfigured()) {
    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: false,
      message: 'SMS service not configured'
    });
    return res.status(503).json({ error: 'SMS service is not configured' });
  }

  const { message } = req.body || {};
  const trimmedMessage = (message || '').trim();
  if (!trimmedMessage) {
    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: false,
      message: 'Message is required'
    });
    return res.status(400).json({ error: 'Message is required' });
  }

  const session = driver.session();
  try {
    // Get all applicants with phone numbers who have explicitly opted in to SMS
    // NULL is treated as opted-out (privacy-first approach)
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.contact IS NOT NULL AND a.contact <> '' AND a.smsOptIn = true
       RETURN a.id AS id, a.name AS name, a.contact AS contact, a.smsOptIn AS smsOptIn`
    );

    const applicants = result.records.map(r => ({
      id: r.get('id'),
      name: r.get('name') || '',
      contact: r.get('contact') || '',
      smsOptIn: r.get('smsOptIn') || false
    }));

    if (applicants.length === 0) {
      // Check if there are any clients with phone numbers at all (for debugging)
      const checkResult = await session.run(
        `MATCH (a:Applicant)
         WHERE a.contact IS NOT NULL AND a.contact <> ''
         RETURN count(a) AS total, 
                sum(CASE WHEN a.smsOptIn = true THEN 1 ELSE 0 END) AS optedIn,
                sum(CASE WHEN a.smsOptIn = false THEN 1 ELSE 0 END) AS optedOut,
                sum(CASE WHEN a.smsOptIn IS NULL THEN 1 ELSE 0 END) AS notSet`
      );
      const record = checkResult.records[0];
      const total = record ? (record.get('total')?.toNumber ? record.get('total').toNumber() : Number(record.get('total') || 0)) : 0;
      const optedIn = record ? (record.get('optedIn')?.toNumber ? record.get('optedIn').toNumber() : Number(record.get('optedIn') || 0)) : 0;
      const optedOut = record ? (record.get('optedOut')?.toNumber ? record.get('optedOut').toNumber() : Number(record.get('optedOut') || 0)) : 0;
      const notSet = record ? (record.get('notSet')?.toNumber ? record.get('notSet').toNumber() : Number(record.get('notSet') || 0)) : 0;
      
      await auditLogger.log(req, {
        action: 'sms.blast',
        resourceType: 'sms',
        resourceId: null,
        success: false,
        message: 'No applicants with phone numbers and SMS opt-in found',
        details: { total, optedIn, optedOut, notSet }
      });
      return res.status(400).json({ 
        error: 'No applicants with phone numbers and SMS opt-in found',
        details: `Total clients with phone numbers: ${total}. Opted in: ${optedIn}, Opted out: ${optedOut}, Not set: ${notSet}. Please ensure clients have opted in to receive SMS messages.`
      });
    }

    let sent = 0;
    let failed = 0;
    const errors = [];

    // Send SMS to each applicant
    for (const applicant of applicants) {
      const normalizedPhone = normalizePhone(applicant.contact);
      if (!normalizedPhone) {
        failed++;
        errors.push(`${applicant.name || applicant.id}: Invalid phone number format`);
        continue;
      }

      try {
        await smsService.sendSms({
          to: normalizedPhone,
          body: trimmedMessage
        });
        sent++;

        // Log as case event if possible
        try {
          await caseEventModel.addEvent(applicant.id, {
            type: 'sms',
            description: `SMS blast sent: "${trimmedMessage.length > 50 ? trimmedMessage.substring(0, 47) + '...' : trimmedMessage}"`,
            user: req.user.name || req.user.email || 'admin'
          });
        } catch (logErr) {
          console.warn(`SMS sent to ${applicant.id} but failed to log case event:`, logErr);
        }
      } catch (smsErr) {
        failed++;
        errors.push(`${applicant.name || applicant.id}: ${smsErr.message}`);
        console.error(`Failed to send SMS to ${applicant.id} (${normalizedPhone}):`, smsErr);
      }
    }

    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: true,
      details: {
        total: applicants.length,
        sent,
        failed,
        messageLength: trimmedMessage.length
      }
    });

    res.json({
      success: true,
      total: applicants.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Failed to send SMS blast:', err);
    console.error('Error stack:', err.stack);
    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: false,
      message: 'Failed to send SMS blast',
      details: { error: err.message, code: err.code }
    });
    res.status(500).json({ 
      error: 'Failed to send SMS blast', 
      details: err.message,
      code: err.code
    });
  } finally {
    await session.close();
  }
});

// Email sending safeguards: Track daily email count (in-memory, resets daily)
const emailSendTracker = {
  date: null,
  count: 0,
  maxDailyLimit: parseInt(process.env.EMAIL_DAILY_LIMIT || '400', 10) // Default 400 (safe margin under 500)
};

// Progress tracking for email blasts (in-memory, keyed by job ID)
const emailBlastProgress = new Map();

function getTodayDateString() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTodayEmailCount() {
  const today = getTodayDateString();
  if (emailSendTracker.date !== today) {
    emailSendTracker.date = today;
    emailSendTracker.count = 0;
  }
  return emailSendTracker.count;
}

function incrementEmailCount(count = 1) {
  const today = getTodayDateString();
  if (emailSendTracker.date !== today) {
    emailSendTracker.date = today;
    emailSendTracker.count = 0;
  }
  emailSendTracker.count += count;
  return emailSendTracker.count;
}

// Validate email address format
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0) return false;
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

// Check for potential spam trigger words (warning only)
function checkSpamWords(text) {
  const spamWords = [
    'free', 'click here', 'act now', 'limited time', 'urgent', 'guarantee',
    'winner', 'congratulations', 'prize', 'cash', '$$$', 'viagra', 'casino'
  ];
  const lowerText = text.toLowerCase();
  const found = spamWords.filter(word => lowerText.includes(word));
  return found;
}

// Get progress for an email blast job
app.get('/api/email-blast/progress/:jobId', authMiddleware, requireRole('admin'), (req, res) => {
  const { jobId } = req.params;
  const progress = emailBlastProgress.get(jobId);
  if (!progress) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(progress);
});

// Send Email blast to all clients with email addresses (admin only)
app.post('/api/email-blast', authMiddleware, requireRole('admin'), async (req, res) => {
  const { subject, message } = req.body || {};
  const trimmedSubject = (subject || '').trim();
  const trimmedMessage = (message || '').trim();
  
  if (!trimmedSubject || !trimmedMessage) {
    await auditLogger.log(req, {
      action: 'email.blast',
      resourceType: 'email',
      resourceId: null,
      success: false,
      message: 'Subject and message are required'
    });
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  // Check for spam words (warning only, don't block)
  const spamWords = checkSpamWords(trimmedSubject + ' ' + trimmedMessage);
  if (spamWords.length > 0) {
    console.warn('Potential spam words detected:', spamWords);
  }

  // Get email settings: check database first, then Offender News config, then environment variables
  let emailSettings = null;
  let dbSettings = null;
  
  // Try to get email settings from database first
  try {
    dbSettings = await configModel.get('email_settings');
    // Only use database settings if they have all required fields
    if (dbSettings && typeof dbSettings === 'object' && 
        dbSettings.smtpHost && dbSettings.smtpUser && dbSettings.smtpPass && dbSettings.emailFrom) {
      emailSettings = dbSettings;
    }
  } catch (err) {
    console.warn('Could not load email settings from database, trying other sources');
  }
  
  // If no complete database settings, try Offender News email config
  if (!emailSettings) {
    let emailConfig = {
      host: process.env.OFFENDER_NEWS_EMAIL_IMAP_HOST || null,
      username: process.env.OFFENDER_NEWS_EMAIL_USERNAME || null,
      password: process.env.OFFENDER_NEWS_EMAIL_PASSWORD || null
    };
    
    try {
      const stored = await configModel.get('offender_news_email');
      if (stored && typeof stored === 'object') {
        emailConfig = {
          host: stored.host || emailConfig.host,
          username: stored.username || emailConfig.username,
          password: stored.password || emailConfig.password
        };
      }
    } catch (err) {
      // If we can't get stored config, use environment variables
      console.warn('Could not load stored email config, using environment variables');
    }
    
    // For Gmail, convert IMAP settings to SMTP
    // Gmail SMTP uses smtp.gmail.com on port 587 (TLS) or 465 (SSL)
    if (emailConfig.host && emailConfig.username && emailConfig.password) {
      emailSettings = {
        smtpHost: emailConfig.host.includes('gmail') ? 'smtp.gmail.com' : emailConfig.host.replace('imap', 'smtp'),
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: emailConfig.username,
        smtpPass: emailConfig.password,
        emailFrom: emailConfig.username,
        emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
      };
      
      // Merge in any partial settings from database (like emailFrom, emailFromName, emailReplyTo)
      if (dbSettings && typeof dbSettings === 'object') {
        if (dbSettings.emailFrom) emailSettings.emailFrom = dbSettings.emailFrom;
        if (dbSettings.emailFromName) emailSettings.emailFromName = dbSettings.emailFromName;
        if (dbSettings.emailReplyTo !== undefined) emailSettings.emailReplyTo = dbSettings.emailReplyTo;
        if (dbSettings.smtpPort) emailSettings.smtpPort = dbSettings.smtpPort;
        if (dbSettings.smtpSecure !== undefined) emailSettings.smtpSecure = dbSettings.smtpSecure;
      }
    }
  }
  
  // Fall back to environment variables if still no settings
  if (!emailSettings) {
    emailSettings = {
      smtpHost: process.env.SMTP_HOST || null,
      smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
      smtpSecure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      smtpUser: process.env.SMTP_USER || null,
      smtpPass: process.env.SMTP_PASS || null,
      emailFrom: process.env.EMAIL_FROM || process.env.SMTP_FROM || null,
      emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
    };
    
    // Merge in any partial settings from database (like emailFrom, emailFromName, emailReplyTo)
    if (dbSettings && typeof dbSettings === 'object') {
      if (dbSettings.emailFrom) emailSettings.emailFrom = dbSettings.emailFrom;
      if (dbSettings.emailFromName) emailSettings.emailFromName = dbSettings.emailFromName;
      if (dbSettings.emailReplyTo !== undefined) emailSettings.emailReplyTo = dbSettings.emailReplyTo;
      if (dbSettings.smtpPort) emailSettings.smtpPort = dbSettings.smtpPort;
      if (dbSettings.smtpSecure !== undefined) emailSettings.smtpSecure = dbSettings.smtpSecure;
    }
  }
  
  const emailFrom = emailSettings.emailFrom;
  const emailHost = emailSettings.smtpHost;
  const emailUser = emailSettings.smtpUser;
  const emailPass = emailSettings.smtpPass;
  
  if (!emailFrom || !emailHost || !emailUser || !emailPass) {
    await auditLogger.log(req, {
      action: 'email.blast',
      resourceType: 'email',
      resourceId: null,
      success: false,
      message: 'Email service not configured'
    });
    return res.status(503).json({ 
      error: 'Email service is not configured. Please configure email settings in the Email Settings page or set SMTP_* environment variables.' 
    });
  }

  // Check daily email limit before proceeding
  const todayCount = getTodayEmailCount();
  // Generate a job ID for progress tracking
  const jobId = require('uuid').v4();
  const progress = {
    jobId,
    total: 0,
    sent: 0,
    failed: 0,
    current: 0,
    status: 'starting',
    startTime: new Date().toISOString(),
    errors: []
  };
  emailBlastProgress.set(jobId, progress);

  // Clean up old progress entries (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [id, p] of emailBlastProgress.entries()) {
    if (new Date(p.startTime).getTime() < oneHourAgo) {
      emailBlastProgress.delete(id);
    }
  }

  const session = driver.session();
  try {
    // Get all applicants with email addresses who have explicitly opted in to email
    // NULL is treated as opted-out (privacy-first approach)
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.email IS NOT NULL AND a.email <> '' AND a.emailOptIn = true
       RETURN a.id AS id, a.name AS name, a.email AS email, a.emailOptIn AS emailOptIn`
    );

    const applicants = result.records.map(r => ({
      id: r.get('id'),
      name: r.get('name') || '',
      email: r.get('email') || ''
    })).filter(a => isValidEmail(a.email)); // Filter out invalid emails upfront

    if (applicants.length === 0) {
      emailBlastProgress.delete(jobId);
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: 'No applicants with valid email addresses found'
      });
      return res.status(400).json({ error: 'No applicants with valid email addresses found' });
    }

    // Check if sending this batch would exceed daily limit
    const wouldExceed = todayCount + applicants.length > emailSendTracker.maxDailyLimit;
    if (wouldExceed) {
      const remaining = Math.max(0, emailSendTracker.maxDailyLimit - todayCount);
      emailBlastProgress.delete(jobId);
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: `Daily email limit would be exceeded. ${remaining} emails remaining today.`
      });
      return res.status(429).json({ 
        error: `Daily email limit would be exceeded. You can send ${remaining} more emails today (${todayCount}/${emailSendTracker.maxDailyLimit} already sent). Please try again tomorrow or send in smaller batches.` 
      });
    }

    // Create transporter for sending emails
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (requireErr) {
      emailBlastProgress.delete(jobId);
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: 'nodemailer package not installed'
      });
      return res.status(503).json({ 
        error: 'Email service requires nodemailer package. Please run: npm install nodemailer' 
      });
    }

    // Create transporter using settings from database/env
    const smtpPort = emailSettings.smtpPort || 587;
    const smtpSecure = emailSettings.smtpSecure || false;
    
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    // Update progress
    progress.total = applicants.length;
    progress.status = 'sending';
    emailBlastProgress.set(jobId, progress);

    // Return job ID immediately and continue processing in background
    res.json({ 
      success: true, 
      jobId,
      message: 'Email blast started. Use the jobId to track progress.'
    });

    // Continue processing asynchronously (don't await)
    processEmailBlastAsync(jobId, applicants, trimmedSubject, trimmedMessage, emailFrom, transporter, emailSettings, req, auditLogger, caseEventModel, emailSendTracker, spamWords).catch(err => {
      console.error('Email blast async processing error:', err);
      const finalProgress = emailBlastProgress.get(jobId);
      if (finalProgress) {
        finalProgress.status = 'error';
        finalProgress.error = err.message;
        emailBlastProgress.set(jobId, finalProgress);
      }
    });
  } catch (err) {
    emailBlastProgress.delete(jobId);
    console.error('Failed to start email blast:', err);
    // Only send response if headers haven't been sent yet
    if (!res.headersSent) {
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: 'Failed to start email blast',
        details: { error: err.message }
      });
      res.status(500).json({ 
        error: 'Failed to start email blast', 
        details: err.message
      });
    }
  } finally {
    await session.close();
  }
});

// Async function to process email blast (runs in background)
async function processEmailBlastAsync(jobId, applicants, trimmedSubject, trimmedMessage, emailFrom, transporter, emailSettings, req, auditLogger, caseEventModel, emailSendTracker, spamWords) {
  let sent = 0;
  let failed = 0;
  const errors = [];
  const progress = emailBlastProgress.get(jobId);
  
  if (!progress) {
    console.error('Progress tracking not found for job:', jobId);
    return;
  }

  try {
    // Email sending configuration
  const RATE_LIMIT_DELAY_MS = 1200; // 1.2 second delay = ~50 emails/minute (safe for Gmail)
  const BATCH_SIZE = 20; // Send in batches of 20
  const BATCH_BREAK_MS = 5000; // 5 second break between batches
  const MAX_RETRIES = 2; // Retry failed sends up to 2 times
  const RETRY_DELAY_MS = 3000; // 3 second delay before retry

  // Helper function to update progress
  function updateProgress() {
    if (progress) {
      progress.sent = sent;
      progress.failed = failed;
      progress.current = sent + failed;
      progress.errors = errors.slice(-10); // Keep last 10 errors
      emailBlastProgress.set(jobId, progress);
    }
  }

  // Helper function to send a single email with retry logic
  async function sendEmailWithRetry(applicant, retryCount = 0) {
      const email = applicant.email.trim();
      
      try {
        // Use a separate reply-to address for replies
        // Note: Bounces typically go to the "from" address (envelope sender), not replyTo
        // To redirect bounces, you need to use a separate email account for the "from" address
        const replyTo = emailSettings.emailReplyTo || process.env.EMAIL_BLAST_REPLY_TO || null;
        
        // Format the "from" address with optional display name
        // Note: Gmail will always show the authenticated account's email address
        // even if we try to use a different "from" address. The display name can be customized.
        let fromAddress = emailFrom;
        if (emailSettings.emailFromName) {
          // Use display name with the authenticated email (Gmail requirement)
          // The email address will still show, but the display name will be what we set
          fromAddress = `${emailSettings.emailFromName} <${emailUser}>`;
        } else {
          // If no display name, use the authenticated email
          fromAddress = emailUser;
        }
        
        const mailOptions = {
          from: fromAddress,
          to: email,
          subject: trimmedSubject,
          text: trimmedMessage,
          html: trimmedMessage.replace(/\n/g, '<br>')
        };
        
        // Only add replyTo if specified (some servers don't like null replyTo)
        if (replyTo) {
          mailOptions.replyTo = replyTo;
        }
        
        await transporter.sendMail(mailOptions);
        return { success: true };
      } catch (emailErr) {
        const errorMsg = emailErr.message || 'Unknown error';
        const errorCode = emailErr.code || emailErr.responseCode;
        
        // Check if this is a retryable error
        const isRetryable = (
          errorMsg.toLowerCase().includes('timeout') ||
          errorMsg.toLowerCase().includes('connection') ||
          errorMsg.toLowerCase().includes('temporary') ||
          errorCode === 'ETIMEDOUT' ||
          errorCode === 'ECONNRESET' ||
          (errorCode >= 500 && errorCode < 600) // Server errors
        );
        
        // Check if this is a rate limit/quota error
        const isRateLimit = (
          errorMsg.toLowerCase().includes('rate limit') ||
          errorMsg.toLowerCase().includes('too many') ||
          errorMsg.toLowerCase().includes('quota') ||
          errorMsg.toLowerCase().includes('exceeded') ||
          errorCode === 550 ||
          errorCode === 421 ||
          (errorCode >= 430 && errorCode < 450)
        );
        
        // Retry if retryable and haven't exceeded max retries
        if (isRetryable && retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
          return sendEmailWithRetry(applicant, retryCount + 1);
        }
        
        return { 
          success: false, 
          error: errorMsg,
          isRateLimit,
          isRetryable
        };
      }
    }

  // Send emails in batches with breaks
  for (let batchStart = 0; batchStart < applicants.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, applicants.length);
    const batch = applicants.slice(batchStart, batchEnd);
    
    console.log(`Sending email batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (${batchStart + 1}-${batchEnd} of ${applicants.length})`);
    
    for (let i = 0; i < batch.length; i++) {
      const applicant = batch[i];
      const email = applicant.email.trim();
      
      if (!isValidEmail(email)) {
        failed++;
        errors.push(`${applicant.name || applicant.id}: Invalid email address format`);
        updateProgress();
        continue;
      }

      const result = await sendEmailWithRetry(applicant);
      
      if (result.success) {
        sent++;
        incrementEmailCount(1);

        // Log as case event if possible
        try {
          await caseEventModel.addEvent(applicant.id, {
            type: 'email',
            description: `Email blast sent: "${trimmedSubject}"`,
            user: req.user.name || req.user.email || 'admin'
          });
        } catch (logErr) {
          console.warn(`Email sent to ${applicant.id} but failed to log case event:`, logErr);
        }
      } else {
        failed++;
        errors.push(`${applicant.name || applicant.id}: ${result.error}`);
        console.error(`Failed to send email to ${applicant.id} (${email}):`, result.error);
        
        // If we hit a rate limit error, add extra delay and consider stopping
        if (result.isRateLimit) {
          console.warn('Rate limit detected, adding extended delay...');
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS * 10)); // 12 second delay
          
          // If we're getting rate limited, warn but continue with longer delays
          if (failed > applicants.length * 0.1) { // If more than 10% are failing
            console.warn('High failure rate detected, consider stopping the blast');
          }
        }
      }
      
      // Update progress after each email
      updateProgress();
      
      // Rate limiting: add delay between emails (except for the last one in batch)
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    }
    
    // Break between batches (except after the last batch)
    if (batchEnd < applicants.length) {
      console.log(`Batch complete. Taking ${BATCH_BREAK_MS / 1000} second break before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_BREAK_MS));
    }
  }

  // Mark as complete
  const finalCount = getTodayEmailCount();
  progress.status = 'completed';
  progress.endTime = new Date().toISOString();
  progress.sent = sent;
  progress.failed = failed;
  progress.errors = errors;
  emailBlastProgress.set(jobId, progress);

  await auditLogger.log(req, {
    action: 'email.blast',
    resourceType: 'email',
    resourceId: jobId,
    success: true,
    details: {
      total: applicants.length,
      sent,
      failed,
      subject: trimmedSubject,
      messageLength: trimmedMessage.length,
      dailyCount: finalCount,
      spamWordsDetected: spamWords.length > 0 ? spamWords : undefined
    }
  });

    // Clean up progress after 1 hour
    setTimeout(() => {
      emailBlastProgress.delete(jobId);
    }, 60 * 60 * 1000);
  } catch (err) {
    console.error('Error in email blast async processing:', err);
    if (progress) {
      progress.status = 'error';
      progress.error = err.message;
      emailBlastProgress.set(jobId, progress);
    }
  }
}

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
    await auditLogger.log(req, {
      action: 'case.file_delete',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: { filename }
    });
    res.json({ success: true });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'case.file_delete',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to delete file',
      details: { filename, error: err.message }
    });
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
  async (req, res, next) => {
    // Only allow 'admin' or 'case_worker' roles
    const roles = req.user && (req.user.roles || req.user.groups || []);
    if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
      return next();
    }
    await auditLogger.log(req, {
      action: 'case.file_upload',
      resourceType: 'case',
      resourceId: req.params?.caseId || null,
      success: false,
      message: 'Forbidden: insufficient role'
    });
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  },
  upload.single('file'),
  async (req, res) => {
    const { caseId } = req.params;
    if (!req.file) {
      await auditLogger.log(req, {
        action: 'case.file_upload',
        resourceType: 'case',
        resourceId: caseId,
        success: false,
        message: 'No file uploaded'
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }
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

      await auditLogger.log(req, {
        action: 'case.file_upload',
        resourceType: 'case',
        resourceId: caseId,
        success: true,
        details: {
          filename: fileMeta.filename,
          originalname: fileMeta.originalname,
          size: fileMeta.size
        }
      });
      res.json({ success: true, file: fileMeta });
    } catch (err) {
      await auditLogger.log(req, {
        action: 'case.file_upload',
        resourceType: 'case',
        resourceId: caseId,
        success: false,
        message: 'Failed to save file metadata',
        details: { error: err.message }
      });
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
      `CREATE (a:Applicant {id: $id, name: $name, kinshipRole: $kinshipRole, contact: $contact, email: $email, address: $address, language: $language, community: $community, contactTime: $contactTime, staff: $staff, notes: $notes, smsOptIn: $smsOptIn, emailOptIn: $emailOptIn, status: $status}) RETURN a`,
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
        staff,
        notes: data.notes || '',
        smsOptIn: data.smsOptIn === true || data.smsOptIn === 'true',
        emailOptIn: data.emailOptIn === true || data.emailOptIn === 'true',
        status: data.clientStatus || ''
      }
    );
    // Create LovedOne node if provided
    let lovedOneNode = null;
    if (data.lovedOneName || data.relationship) {
      const lovedOneId = 'L' + Date.now() + '-' + Math.floor(Math.random()*1e6);
      const lovedOneResult = await session.run(
        `CREATE (l:LovedOne {id: $id, name: $name, dateOfIncident: $dateOfIncident, lastLocation: $lastLocation, community: $community, lastLocationLat: $lastLocationLat, lastLocationLon: $lastLocationLon, policeInvestigationNumber: $policeInvestigationNumber, investigation: $investigation, otherInvestigation: $otherInvestigation, supportSelections: $supportSelections, otherSupport: $otherSupport, additionalNotes: $additionalNotes, status: $status}) RETURN l`,
        {
          id: lovedOneId,
          name: data.lovedOneName || '',
          dateOfIncident: data.incidentDate || '',
          lastLocation: data.lastLocation || '',
          community: data.lovedOneCommunity || '',
          lastLocationLat: (data.lastLocationLat !== undefined && data.lastLocationLat !== '' ? parseFloat(data.lastLocationLat) : null),
          lastLocationLon: (data.lastLocationLon !== undefined && data.lastLocationLon !== '' ? parseFloat(data.lastLocationLon) : null),
          policeInvestigationNumber: data.policeInvestigationNumber || '',
          investigation: Array.isArray(data.investigation) ? data.investigation : [],
          otherInvestigation: data.otherInvestigation || '',
          supportSelections: Array.isArray(data.support) ? data.support : [],
          otherSupport: data.otherSupport || '',
          additionalNotes: data.notes || '',
          status: data.lovedOneStatus || ''
        }
      );
      lovedOneNode = lovedOneResult.records[0]?.get('l');
      // Create relationship
      await session.run(
        `MATCH (a:Applicant {id: $applicantId}), (l:LovedOne {id: $lovedOneId}) CREATE (a)-[:RELATED_TO {relationship: $relationship}]->(l)`,
        {
          applicantId,
          lovedOneId,
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
    await auditLogger.log(req, {
      action: 'applicant.create',
      resourceType: 'applicant',
      resourceId: applicantId,
      success: true,
      details: {
        staff,
        hasLovedOne: Boolean(lovedOneNode),
        referringOrganization: data.referringOrganization || null
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    await auditLogger.log(req, {
      action: 'applicant.create',
      resourceType: 'applicant',
      resourceId: null,
      success: false,
      message: 'Failed to save intake form',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to save intake form.' });
  }
});

// Start server
// Initialize default client statuses on first startup
async function initializeClientStatuses() {
  const defaultStatuses = [
    'Active',
    'Follow-up Required',
    'On Hold',
    'Closed',
    'Referred',
    'No Contact'
  ];

  const session = driver.session();
  try {
    console.log('Checking for default client statuses...');
    for (const statusName of defaultStatuses) {
      // Check if status already exists
      const existing = await session.run(
        'MATCH (s:ClientStatus {name: $name}) RETURN s',
        { name: statusName }
      );

      if (existing.records.length === 0) {
        // Create the status if it doesn't exist
        await session.run(
          'CREATE (s:ClientStatus {name: $name, active: true})',
          { name: statusName }
        );
        console.log(`  ✓ Created client status: ${statusName}`);
      } else {
        // Reactivate if it exists but is inactive
        const status = existing.records[0].get('s').properties;
        if (status.active === false) {
          await session.run(
            'MATCH (s:ClientStatus {name: $name}) SET s.active = true',
            { name: statusName }
          );
          console.log(`  ✓ Reactivated client status: ${statusName}`);
        } else {
          console.log(`  - Client status already exists: ${statusName}`);
        }
      }
    }
    console.log('Client status initialization complete.');
  } catch (err) {
    console.error('Error initializing client statuses:', err.message);
  } finally {
    await session.close();
  }
}

// Initialize default Loved One (Missing Person) statuses on first startup
async function initializeLovedOneStatuses() {
  const defaultStatuses = [
    'Active',
    'Under Investigation',
    'Search in Progress',
    'Awaiting Information',
    'Found Safe',
    'Found Deceased',
    'Voluntary Return',
    'Case Closed',
    'Suspended',
    'Cold Case'
  ];

  const session = driver.session();
  try {
    console.log('Checking for default Loved One statuses...');
    for (const statusName of defaultStatuses) {
      // Check if status already exists
      const existing = await session.run(
        'MATCH (s:LovedOneStatus {name: $name}) RETURN s',
        { name: statusName }
      );

      if (existing.records.length === 0) {
        // Create the status if it doesn't exist
        await session.run(
          'CREATE (s:LovedOneStatus {name: $name, active: true})',
          { name: statusName }
        );
        console.log(`  ✓ Created Loved One status: ${statusName}`);
      } else {
        // Reactivate if it exists but is inactive
        const status = existing.records[0].get('s').properties;
        if (status.active === false) {
          await session.run(
            'MATCH (s:LovedOneStatus {name: $name}) SET s.active = true',
            { name: statusName }
          );
          console.log(`  ✓ Reactivated Loved One status: ${statusName}`);
        } else {
          console.log(`  - Loved One status already exists: ${statusName}`);
        }
      }
    }
    console.log('Loved One status initialization complete.');
  } catch (err) {
    console.error('Error initializing Loved One statuses:', err.message);
  } finally {
    await session.close();
  }
}

app.listen(PORT, async () => {
  // Set Windows CMD window title
  process.stdout.write(`\x1b]2;Missing Persons App - Port ${PORT}\x07`);
  console.log('========================================');
  console.log('   Missing Persons App Server Started');
  console.log(`   Listening on port: ${PORT}`);
  console.log('========================================');
  
  // Initialize default statuses
  await initializeClientStatuses();
  await initializeLovedOneStatuses();
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
  if (!text || !text.trim()) {
    await auditLogger.log(req, {
      action: 'case.note_create',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Note text required'
    });
    return res.status(400).json({ error: 'Note text required' });
  }
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
      await auditLogger.log(req, {
        action: 'case.note_create',
        resourceType: 'case',
        resourceId: caseId,
        success: false,
        message: 'Not authorized to add note'
      });
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
    await auditLogger.log(req, {
      action: 'case.note_create',
      resourceType: 'case',
      resourceId: caseId,
      success: true
    });
    res.json({ success: true });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'case.note_create',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to add note',
      details: { error: err.message }
    });
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
    // Log unassignment as CaseEvent so it appears in Case Notes
    try {
      const eventId = require('uuid').v4();
      const timestamp = new Date().toISOString();
      await session.run(
        `MATCH (a:Applicant {id: $id})
         CREATE (e:CaseEvent {
           eventId: $eventId,
           type: 'unassignment',
           description: 'All advocates unassigned from case',
           timestamp: $timestamp,
           user: $actor
         })
         CREATE (a)-[:HAS_EVENT]->(e)`,
        {
          id: caseId,
          eventId,
          timestamp,
          actor: (req.user && (req.user.email || req.user.name || req.user.preferred_username)) || 'system'
        }
      );
    } catch (e) {
      console.warn('Failed to log unassignment event for case', caseId, e.message);
    }
    await auditLogger.log(req, {
      action: 'case.unassign_all',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: { removedAssignments: deletedCount }
    });
    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error('[DEBUG] Unassign error for caseId', caseId, ':', err);
    await auditLogger.log(req, {
      action: 'case.unassign_all',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to unassign case',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to unassign case' });
  } finally {
    await session.close();
  }
});

// Add an additional Loved One to an Applicant (case)
app.post('/api/applicants/:id/loved-ones', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, relationship, incidentDate, lastLocation, community, policeInvestigationNumber, investigation, otherInvestigation, supportSelections, support, otherSupport, additionalNotes, status } = req.body || {};
  const user = req.user;
  if (!name || !name.trim()) {
    await auditLogger.log(req, {
      action: 'loved_one.create',
      resourceType: 'loved_one',
      resourceId: null,
      success: false,
      message: 'Loved One name is required',
      details: { applicantId: id }
    });
    return res.status(400).json({ error: 'Loved One name is required' });
  }
  const session = driver.session();
  try {
    // Permission: admin or assigned to this case
    let canEdit = false;
    const rawUserRoles = (user && (user.roles || user.groups || user.roles_claim)) || [];
    const userRoles = (Array.isArray(rawUserRoles) ? rawUserRoles : [rawUserRoles])
      .filter(Boolean)
      .map(r => String(r).toLowerCase());
    if (userRoles.includes('admin')) {
      canEdit = true;
    } else {
      const result = await session.run('MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a', { caseId: id, email: user.email || user.preferred_username });
      canEdit = result.records.length > 0;
    }
    if (!canEdit) {
      await session.close();
      await auditLogger.log(req, {
        action: 'loved_one.create',
        resourceType: 'loved_one',
        resourceId: null,
        success: false,
        message: 'Not authorized to add loved one',
        details: { applicantId: id }
      });
      return res.status(403).json({ error: 'Not authorized' });
    }
    const lovedOneId = 'L' + Date.now() + '-' + Math.floor(Math.random()*1e6);
    const investigationList = Array.isArray(investigation) ? investigation : [];
    const supportList = Array.isArray(supportSelections) ? supportSelections : (Array.isArray(support) ? support : []);
    const createRes = await session.run(
      `MATCH (a:Applicant {id: $applicantId})
       CREATE (l:LovedOne {
         id: $id,
         name: $name,
         dateOfIncident: $dateOfIncident,
         lastLocation: $lastLocation,
         community: $community,
         status: $status,
         lastLocationLat: $lastLocationLat,
         lastLocationLon: $lastLocationLon,
         policeInvestigationNumber: $policeInvestigationNumber,
         investigation: $investigation,
         otherInvestigation: $otherInvestigation,
         supportSelections: $supportSelections,
         otherSupport: $otherSupport,
         additionalNotes: $additionalNotes
       })
       CREATE (a)-[:RELATED_TO {relationship: $relationship}]->(l)
       RETURN l`,
      {
        applicantId: id,
        id: lovedOneId,
        name: name || '',
        dateOfIncident: incidentDate || '',
        lastLocation: lastLocation || '',
        community: community || '',
        relationship: relationship || '',
        lastLocationLat: (req.body && req.body.lastLocationLat !== undefined && req.body.lastLocationLat !== '' ? parseFloat(req.body.lastLocationLat) : null),
        lastLocationLon: (req.body && req.body.lastLocationLon !== undefined && req.body.lastLocationLon !== '' ? parseFloat(req.body.lastLocationLon) : null),
        policeInvestigationNumber: policeInvestigationNumber || '',
        investigation: investigationList,
        otherInvestigation: otherInvestigation || '',
        supportSelections: supportList,
        otherSupport: otherSupport || '',
        additionalNotes: additionalNotes || '',
        status: status || ''
      }
    );
    const lnode = createRes.records[0]?.get('l');
    await session.close();
    await auditLogger.log(req, {
      action: 'loved_one.create',
      resourceType: 'loved_one',
      resourceId: lovedOneId,
      success: true,
      details: { applicantId: id, relationship: relationship || '' }
    });
    return res.json({ success: true, lovedOne: lnode ? lnode.properties : null });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'loved_one.create',
      resourceType: 'loved_one',
      resourceId: null,
      success: false,
      message: 'Failed to add Loved One',
      details: { error: err.message, applicantId: id }
    });
    return res.status(500).json({ error: 'Failed to add Loved One' });
  }
});

// Search Loved Ones by community (admin and case_worker)
app.get('/api/loved-ones', authMiddleware, async (req, res) => {
  const { community } = req.query;
  if (!community || !community.trim()) {
    return res.status(400).json({ error: 'community is required' });
  }
  const roles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const isAllowed = Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'));
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (l:LovedOne {community: $community})<- [rel:RELATED_TO]-(a:Applicant)
       RETURN l, a, rel.relationship AS relationship ORDER BY l.name`,
      { community }
    );
    const results = result.records.map(r => ({
      lovedOne: r.get('l').properties,
      applicant: r.get('a').properties,
      relationship: r.get('relationship') || ''
    }));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search loved ones' });
  } finally {
    await session.close();
  }
});

// Search Loved Ones by date range (admin and case_worker)
app.get('/api/loved-ones/by-date', authMiddleware, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });
  }
  const roles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const isAllowed = Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'));
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  const session = driver.session();
  try {
    // dateOfIncident stored as ISO date string; string range compare is valid
    const result = await session.run(
      `MATCH (l:LovedOne)<-[rel:RELATED_TO]-(a:Applicant)
       WHERE l.dateOfIncident >= $start AND l.dateOfIncident <= $end
       RETURN l, a, rel.relationship AS relationship
       ORDER BY l.dateOfIncident, l.name`,
      { start, end }
    );
    const results = result.records.map(r => ({
      lovedOne: r.get('l').properties,
      applicant: r.get('a').properties,
      relationship: r.get('relationship') || ''
    }));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search loved ones by date' });
  } finally {
    await session.close();
  }
});

// Search Loved Ones by province (admin and case_worker)
// Supports province code (e.g., 'AB', 'BC', 'ON', 'MB', 'SK') or full name (e.g., 'Alberta', 'British Columbia')
app.get('/api/loved-ones/by-province', authMiddleware, async (req, res) => {
  const { province } = req.query;
  if (!province || !province.trim()) {
    return res.status(400).json({ error: 'province is required (e.g., "AB", "Alberta", "BC", "British Columbia")' });
  }
  const roles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const isAllowed = Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'));
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  
  // Map province names to codes for flexible querying
  const provinceMap = {
    'alberta': 'AB',
    'british columbia': 'BC',
    'manitoba': 'MB',
    'new brunswick': 'NB',
    'newfoundland and labrador': 'NL',
    'northwest territories': 'NT',
    'nova scotia': 'NS',
    'nunavut': 'NU',
    'ontario': 'ON',
    'prince edward island': 'PE',
    'quebec': 'QC',
    'saskatchewan': 'SK',
    'yukon': 'YT'
  };
  
  const provinceLower = province.trim().toLowerCase();
  const provinceCode = provinceMap[provinceLower] || province.trim().toUpperCase();
  
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (l:LovedOne)<-[rel:RELATED_TO]-(a:Applicant)
       WHERE l.province = $provinceCode
       RETURN l, a, rel.relationship AS relationship
       ORDER BY l.name`,
      { provinceCode }
    );
    const results = result.records.map(r => ({
      lovedOne: r.get('l').properties,
      applicant: r.get('a').properties,
      relationship: r.get('relationship') || ''
    }));
    res.json({ results });
  } catch (err) {
    console.error('Failed to search loved ones by province:', err);
    res.status(500).json({ error: 'Failed to search loved ones by province', details: err.message });
  } finally {
    await session.close();
  }
});

// Search Applicants by province (admin and case_worker)
// Supports province code (e.g., 'AB', 'BC', 'ON', 'MB', 'SK') or full name (e.g., 'Alberta', 'British Columbia')
app.get('/api/applicants/by-province', authMiddleware, async (req, res) => {
  const { province } = req.query;
  if (!province || !province.trim()) {
    return res.status(400).json({ error: 'province is required (e.g., "AB", "Alberta", "BC", "British Columbia")' });
  }
  const roles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const isAllowed = Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'));
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  
  // Map province names to codes for flexible querying
  const provinceMap = {
    'alberta': 'AB',
    'british columbia': 'BC',
    'manitoba': 'MB',
    'new brunswick': 'NB',
    'newfoundland and labrador': 'NL',
    'northwest territories': 'NT',
    'nova scotia': 'NS',
    'nunavut': 'NU',
    'ontario': 'ON',
    'prince edward island': 'PE',
    'quebec': 'QC',
    'saskatchewan': 'SK',
    'yukon': 'YT'
  };
  
  const provinceLower = province.trim().toLowerCase();
  const provinceCode = provinceMap[provinceLower] || province.trim().toUpperCase();
  
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.province = $provinceCode
       RETURN a
       ORDER BY a.name`,
      { provinceCode }
    );
    const applicants = result.records.map(r => r.get('a').properties);
    res.json({ applicants });
  } catch (err) {
    console.error('Failed to search applicants by province:', err);
    res.status(500).json({ error: 'Failed to search applicants by province', details: err.message });
  } finally {
    await session.close();
  }
});

// Update an Applicant (Case) fields (admin or assigned case worker)
app.put('/api/applicants/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    kinshipRole,
    contact,
    email,
    address,
    language,
    community,
    contactTime,
    notes,
    newsKeywords,
    referringOrganization,
    smsOptIn,
    emailOptIn,
    status
  } = req.body || {};
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAdmin = roles.includes('admin');
  const isCaseWorker = roles.includes('case_worker');
  // Normalize newsKeywords into an array of non-empty strings or null
  let newsKeywordsParam = null;
  if (Array.isArray(newsKeywords)) {
    newsKeywordsParam = newsKeywords
      .map(k => String(k).trim())
      .filter(k => k.length > 0);
    if (!newsKeywordsParam.length) newsKeywordsParam = null;
  } else if (typeof newsKeywords === 'string') {
    const trimmed = newsKeywords.trim();
    if (trimmed) {
      newsKeywordsParam = trimmed
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      if (!newsKeywordsParam.length) newsKeywordsParam = null;
    }
  }
  const session = driver.session();
  try {
    if (!isAdmin) {
      if (!isCaseWorker) {
        await auditLogger.log(req, {
          action: 'applicant.update',
          resourceType: 'applicant',
          resourceId: id,
          success: false,
          message: 'Forbidden: insufficient role'
        });
        await session.close();
        return res.status(403).json({ error: 'Forbidden' });
      }
      // Ensure this user is assigned to the case
      const check = await session.run(
        'MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a',
        { caseId: id, email: req.user.email || req.user.preferred_username }
      );
      if (check.records.length === 0) {
        await auditLogger.log(req, {
          action: 'applicant.update',
          resourceType: 'applicant',
          resourceId: id,
          success: false,
          message: 'Forbidden: not assigned to case'
        });
        await session.close();
        return res.status(403).json({ error: 'Not authorized' });
      }
    }
    // Prepare parameters (avoid undefined, use null instead so coalesce works)
    const applicantParams = {
      id,
      name: name ?? null,
      kinshipRole: kinshipRole ?? null,
      contact: contact ?? null,
      email: email ?? null,
      address: address ?? null,
      language: language ?? null,
      community: community ?? null,
      contactTime: contactTime ?? null,
      notes: notes ?? null,
      smsOptIn: smsOptIn !== undefined ? (smsOptIn === true || smsOptIn === 'true') : null,
      emailOptIn: emailOptIn !== undefined ? (emailOptIn === true || emailOptIn === 'true') : null,
      status: status ?? null
    };

    // Update core applicant fields; only set provided fields
    await session.run(
      `MATCH (a:Applicant {id: $id})
       SET a.name = coalesce($name, a.name),
           a.kinshipRole = coalesce($kinshipRole, a.kinshipRole),
           a.contact = coalesce($contact, a.contact),
           a.email = coalesce($email, a.email),
           a.address = coalesce($address, a.address),
           a.language = coalesce($language, a.language),
           a.community = coalesce($community, a.community),
           a.contactTime = coalesce($contactTime, a.contactTime),
           a.notes = coalesce($notes, a.notes),
           a.smsOptIn = coalesce($smsOptIn, a.smsOptIn),
           a.emailOptIn = coalesce($emailOptIn, a.emailOptIn),
           a.status = coalesce($status, a.status)`,
      applicantParams
    );
    // Update newsKeywords only if provided (non-null) to avoid type issues
    if (newsKeywordsParam !== null) {
      await session.run(
        `MATCH (a:Applicant {id: $id})
         SET a.newsKeywords = $newsKeywordsParam`,
        { id, newsKeywordsParam }
      );
    }
    // Update referring organization relationship if provided
    if (referringOrganization !== undefined) {
      // Remove existing relationship and create a new one if org name provided and exists
      await session.run(
        `MATCH (a:Applicant {id: $id})
         OPTIONAL MATCH (a)-[r:REFERRED_BY]->(:Organization)
         DELETE r`,
        { id }
      );
      if (referringOrganization) {
        await session.run(
          `MATCH (a:Applicant {id: $id}), (o:Organization {name: $orgName})
           MERGE (a)-[:REFERRED_BY]->(o)`,
          { id, orgName: referringOrganization }
        );
      }
    }
    // Return updated applicant with referring org
    const result = await session.run(
      `MATCH (a:Applicant {id: $id})
       OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
       RETURN a, o`,
      { id }
    );
    const aNode = result.records[0] && result.records[0].get('a');
    const oNode = result.records[0] && result.records[0].get('o');
    await session.close();
    await auditLogger.log(req, {
      action: 'applicant.update',
      resourceType: 'applicant',
      resourceId: id,
      success: true,
      details: { updatedFields: Object.keys(req.body || {}) }
    });
    return res.json({
      success: true,
      applicant: aNode ? aNode.properties : null,
      referringOrg: oNode ? oNode.properties : null
    });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'applicant.update',
      resourceType: 'applicant',
      resourceId: id,
      success: false,
      message: 'Failed to update applicant',
      details: { error: err.message }
    });
    console.error('ERROR: Failed to update applicant', {
      applicantId: id,
      message: err.message,
      stack: err.stack,
      payload: {
        name,
        kinshipRole,
        contact,
        email,
        address,
        language,
        community,
        contactTime,
        notes,
        newsKeywords
      }
    });
    return res.status(500).json({ error: 'Failed to update applicant', details: err.message });
  }
});

// Update a Loved One (and optionally relationship for a specific Applicant)
app.put('/api/loved-ones/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const {
    applicantId,
    name,
    dateOfIncident,
    lastLocation,
    community,
    relationship,
    status,
    lastLocationLat,
    lastLocationLon,
    policeInvestigationNumber,
    investigation,
    otherInvestigation,
    supportSelections,
    support,
    otherSupport,
    additionalNotes
  } = req.body || {};
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAdmin = roles.includes('admin');
  const isCaseWorker = roles.includes('case_worker');
  const session = driver.session();
  try {
    if (!isAdmin) {
      // For non-admin, require applicantId and ensure user is assigned to that case
      if (!applicantId || !isCaseWorker) {
        await auditLogger.log(req, {
          action: 'loved_one.update',
          resourceType: 'loved_one',
          resourceId: id,
          success: false,
          message: 'Forbidden: insufficient role or missing applicantId'
        });
        await session.close();
        return res.status(403).json({ error: 'Forbidden' });
      }
      const check = await session.run(
        'MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a',
        { caseId: applicantId, email: req.user.email || req.user.preferred_username }
      );
      if (check.records.length === 0) {
        await auditLogger.log(req, {
          action: 'loved_one.update',
          resourceType: 'loved_one',
          resourceId: id,
          success: false,
          message: 'Forbidden: not assigned to applicant',
          details: { applicantId }
        });
        await session.close();
        return res.status(403).json({ error: 'Not authorized' });
      }
    }
    const investigationProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'investigation');
    const otherInvestigationProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'otherInvestigation');
    const supportProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'supportSelections') || Object.prototype.hasOwnProperty.call(req.body || {}, 'support');
    const otherSupportProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'otherSupport');
    const notesProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'additionalNotes');
    const investigationList = investigationProvided ? (Array.isArray(investigation) ? investigation : []) : null;
    const supportList = supportProvided ? (Array.isArray(supportSelections) ? supportSelections : (Array.isArray(support) ? support : [])) : null;
    const otherInvestigationValue = otherInvestigationProvided ? (otherInvestigation || '') : null;
    const otherSupportValue = otherSupportProvided ? (otherSupport || '') : null;
    const notesValue = notesProvided ? (additionalNotes || '') : null;
    await session.run(
      `MATCH (l:LovedOne {id: $id})
       SET l.name = coalesce($name, l.name),
           l.dateOfIncident = coalesce($dateOfIncident, l.dateOfIncident),
           l.lastLocation = coalesce($lastLocation, l.lastLocation),
           l.community = coalesce($community, l.community),
           l.status = coalesce($status, l.status),
           l.lastLocationLat = coalesce($lastLocationLat, l.lastLocationLat),
           l.lastLocationLon = coalesce($lastLocationLon, l.lastLocationLon),
           l.policeInvestigationNumber = coalesce($policeInvestigationNumber, l.policeInvestigationNumber),
           l.investigation = coalesce($investigation, l.investigation),
           l.otherInvestigation = coalesce($otherInvestigation, l.otherInvestigation),
           l.supportSelections = coalesce($supportSelections, l.supportSelections),
           l.otherSupport = coalesce($otherSupport, l.otherSupport),
           l.additionalNotes = coalesce($additionalNotes, l.additionalNotes)`,
      {
        id,
        name,
        dateOfIncident,
        lastLocation,
        community,
        status,
        lastLocationLat: (lastLocationLat !== undefined && lastLocationLat !== '' ? parseFloat(lastLocationLat) : null),
        lastLocationLon: (lastLocationLon !== undefined && lastLocationLon !== '' ? parseFloat(lastLocationLon) : null),
        policeInvestigationNumber,
        investigation: investigationList,
        otherInvestigation: otherInvestigationValue,
        supportSelections: supportList,
        otherSupport: otherSupportValue,
        additionalNotes: notesValue
      }
    );
    // Update relationship if provided and applicantId is provided
    if (relationship != null && applicantId) {
      await session.run(
        `MATCH (a:Applicant {id: $applicantId})-[rel:RELATED_TO]->(l:LovedOne {id: $id})
         SET rel.relationship = $relationship`,
        { applicantId, id, relationship }
      );
    }
    // Return updated node
    const resNode = await session.run('MATCH (l:LovedOne {id: $id}) RETURN l', { id });
    const lovedOne = resNode.records[0] ? resNode.records[0].get('l').properties : null;
    await session.close();
    await auditLogger.log(req, {
      action: 'loved_one.update',
      resourceType: 'loved_one',
      resourceId: id,
      success: true,
      details: { applicantId: applicantId || null, updatedFields: Object.keys(req.body || {}) }
    });
    return res.json({ success: true, lovedOne });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'loved_one.update',
      resourceType: 'loved_one',
      resourceId: id,
      success: false,
      message: 'Failed to update Loved One',
      details: { error: err.message, applicantId: applicantId || null }
    });
    return res.status(500).json({ error: 'Failed to update Loved One' });
  }
});

module.exports = app;
