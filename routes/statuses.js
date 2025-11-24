/**
 * Status Routes
 * Handles Client Status and LovedOne Status management endpoints
 */

const express = require('express');
const statusController = require('../controllers/statusController');

function setupStatusRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole } = dependencies;

  // Client Status routes
  // GET /api/client-statuses - Get all client statuses
  router.get('/client-statuses', authMiddleware, (req, res) => {
    statusController.getClientStatuses(req, res, driver, auditLogger);
  });

  // POST /api/client-statuses - Create a new client status (admin only)
  router.post('/client-statuses', authMiddleware, requireRole('admin'), (req, res) => {
    statusController.createClientStatus(req, res, driver, auditLogger);
  });

  // DELETE /api/client-statuses - Delete a client status (admin only, soft delete)
  router.delete('/client-statuses', authMiddleware, requireRole('admin'), (req, res) => {
    statusController.deleteClientStatus(req, res, driver, auditLogger);
  });

  // LovedOne Status routes
  // GET /api/loved-one-statuses - Get all loved one statuses
  router.get('/loved-one-statuses', authMiddleware, (req, res) => {
    statusController.getLovedOneStatuses(req, res, driver, auditLogger);
  });

  // POST /api/loved-one-statuses - Create a new loved one status (admin only)
  router.post('/loved-one-statuses', authMiddleware, requireRole('admin'), (req, res) => {
    statusController.createLovedOneStatus(req, res, driver, auditLogger);
  });

  // DELETE /api/loved-one-statuses - Delete a loved one status (admin only, soft delete)
  router.delete('/loved-one-statuses', authMiddleware, requireRole('admin'), (req, res) => {
    statusController.deleteLovedOneStatus(req, res, driver, auditLogger);
  });
}

module.exports = setupStatusRoutes;

