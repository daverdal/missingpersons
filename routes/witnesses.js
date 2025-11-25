const express = require('express');
const router = express.Router();
const witnessController = require('../controllers/witnessController');

/**
 * Witness routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupWitnessRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole } = dependencies;

  // GET /api/witnesses - Get all witnesses with optional filters
  router.get('/witnesses', authMiddleware, (req, res) => {
    witnessController.getWitnesses(req, res, driver, auditLogger);
  });

  // GET /api/witnesses/:witnessId - Get witness by ID
  router.get('/witnesses/:witnessId', authMiddleware, (req, res) => {
    witnessController.getWitnessById(req, res, driver, auditLogger);
  });

  // POST /api/witnesses - Create a new witness
  router.post('/witnesses', authMiddleware, (req, res) => {
    witnessController.createWitness(req, res, driver, auditLogger);
  });

  // PUT /api/witnesses/:witnessId - Update a witness
  router.put('/witnesses/:witnessId', authMiddleware, (req, res) => {
    witnessController.updateWitness(req, res, driver, auditLogger);
  });

  // DELETE /api/witnesses/:witnessId - Delete a witness
  router.delete('/witnesses/:witnessId', authMiddleware, (req, res) => {
    witnessController.deleteWitness(req, res, driver, auditLogger);
  });
}

module.exports = setupWitnessRoutes;

