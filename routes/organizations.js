const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');

/**
 * Organization routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupOrganizationRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole } = dependencies;

  // GET /api/organizations - Get all organizations
  router.get('/organizations', authMiddleware, (req, res) => {
    organizationController.getOrganizations(req, res, driver, auditLogger);
  });

  // POST /api/organizations - Create or update an organization (admin only)
  router.post('/organizations', authMiddleware, requireRole('admin'), (req, res) => {
    organizationController.createOrUpdateOrganization(req, res, driver, auditLogger);
  });

  // DELETE /api/organizations - Delete (deactivate) an organization (admin only)
  router.delete('/organizations', authMiddleware, requireRole('admin'), (req, res) => {
    organizationController.deleteOrganization(req, res, driver, auditLogger);
  });

  // GET /api/organizations/:orgId/contacts - Get all contacts for an organization
  router.get('/organizations/:orgId/contacts', authMiddleware, (req, res) => {
    organizationController.getOrganizationContacts(req, res, driver, auditLogger);
  });

  // POST /api/organizations/:orgId/contacts - Create or update a contact (admin only)
  router.post('/organizations/:orgId/contacts', authMiddleware, requireRole('admin'), (req, res) => {
    organizationController.createOrUpdateContact(req, res, driver, auditLogger);
  });

  // DELETE /api/organizations/:orgId/contacts/:contactId - Delete a contact (admin only)
  router.delete('/organizations/:orgId/contacts/:contactId', authMiddleware, requireRole('admin'), (req, res) => {
    organizationController.deleteContact(req, res, driver, auditLogger);
  });

  return router;
}

module.exports = setupOrganizationRoutes;

