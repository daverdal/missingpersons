/**
 * Utility Routes
 * Handles utility endpoints like health checks, graph queries, and authentication
 */

const express = require('express');
const utilityController = require('../controllers/utilityController');

function setupUtilityRoutes(router, dependencies) {
  const { driver, userModel, auditLogger, jwtSecret, neo4jDatabase, upload, authMiddleware, requireRole } = dependencies;

  // POST /api/create-admin - Create admin user endpoint
  router.post('/create-admin', async (req, res) => {
    utilityController.createAdmin(req, res, userModel, auditLogger);
  });

  // POST /api/upload - General file upload endpoint
  router.post('/upload',
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
      utilityController.uploadFile(req, res);
    }
  );

  // GET /api/admin - Admin check endpoint
  router.get('/admin',
    authMiddleware,
    requireRole('admin'),
    (req, res) => {
      utilityController.checkAdmin(req, res);
    }
  );

  // GET /api/health - Health check endpoint
  router.get('/health', (req, res) => {
    utilityController.getHealth(req, res);
  });

  // GET /api/health/db - Database health check endpoint
  router.get('/health/db', async (req, res) => {
    utilityController.getDbHealth(req, res, driver);
  });

  // POST /api/login - Login endpoint
  router.post('/login', async (req, res) => {
    utilityController.login(req, res, userModel, auditLogger, jwtSecret);
  });

  // POST /api/graph-cypher - Graph Cypher query endpoint
  router.post('/graph-cypher', async (req, res) => {
    utilityController.graphCypher(req, res, driver, neo4jDatabase);
  });
}

module.exports = setupUtilityRoutes;

