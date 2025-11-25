const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

/**
 * Dashboard routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupDashboardRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware } = dependencies;

  // GET /api/dashboard/stats - Get dashboard statistics
  router.get('/dashboard/stats', authMiddleware, (req, res) => {
    dashboardController.getDashboardStats(req, res, driver, auditLogger);
  });
}

module.exports = setupDashboardRoutes;

