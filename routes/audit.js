const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');

/**
 * Audit log routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupAuditRoutes(router, dependencies) {
  const { auditLogger, authMiddleware, requireRole, auditLogModel } = dependencies;

  // GET /api/audit-logs - Get audit logs with filtering (admin only)
  router.get('/audit-logs', authMiddleware, requireRole('admin'), (req, res) => {
    auditController.getAuditLogs(req, res, auditLogModel, auditLogger);
  });

  // GET /api/audit-logs/stream - Real-time audit log stream (Server-Sent Events, admin only)
  router.get('/audit-logs/stream', authMiddleware, requireRole('admin'), (req, res) => {
    auditController.streamAuditLogs(req, res, auditLogger);
  });
}

module.exports = setupAuditRoutes;

