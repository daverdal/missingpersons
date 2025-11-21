const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');

/**
 * Community routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupCommunityRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole, database } = dependencies;

  // GET /api/communities - Get all communities (public, no auth required)
  router.get('/communities', (req, res) => {
    communityController.getCommunities(req, res, driver, auditLogger, database);
  });

  // POST /api/communities - Create or update a community (admin only)
  router.post('/communities', authMiddleware, requireRole('admin'), (req, res) => {
    communityController.createOrUpdateCommunity(req, res, driver, auditLogger, database);
  });

  // DELETE /api/communities - Delete a community (admin only)
  router.delete('/communities', authMiddleware, requireRole('admin'), (req, res) => {
    communityController.deleteCommunity(req, res, driver, auditLogger, database);
  });

  return router;
}

module.exports = setupCommunityRoutes;

