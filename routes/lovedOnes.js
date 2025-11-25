/**
 * LovedOnes Routes
 * Handles all LovedOne-related endpoints
 */

const express = require('express');
const lovedOneController = require('../controllers/lovedOneController');

function setupLovedOnesRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware } = dependencies;

  // IMPORTANT: Specific routes must come BEFORE parameterized routes like /loved-ones/:id
  // GET /api/loved-ones/all - Get all loved ones (admin and case_worker only)
  router.get('/loved-ones/all', authMiddleware, (req, res) => {
    lovedOneController.getAllLovedOnes(req, res, driver, auditLogger);
  });

  // GET /api/loved-ones/with-coordinates - Get loved ones with coordinates (admin and case_worker only)
  router.get('/loved-ones/with-coordinates', authMiddleware, (req, res) => {
    lovedOneController.getLovedOnesWithCoordinates(req, res, driver, auditLogger);
  });

  // GET /api/loved-ones/by-date - Get loved ones by date range (admin and case_worker only)
  router.get('/loved-ones/by-date', authMiddleware, (req, res) => {
    lovedOneController.getLovedOnesByDate(req, res, driver, auditLogger);
  });

  // GET /api/loved-ones/by-province - Get loved ones by province (admin and case_worker only)
  router.get('/loved-ones/by-province', authMiddleware, (req, res) => {
    lovedOneController.getLovedOnesByProvince(req, res, driver, auditLogger);
  });

  // GET /api/loved-ones - Get loved ones by community (admin and case_worker only)
  // Supports ?expand=true for comprehensive data
  router.get('/loved-ones', authMiddleware, (req, res) => {
    lovedOneController.getLovedOnesByCommunity(req, res, driver, auditLogger);
  });

  // PUT /api/loved-ones/:id - Update loved one (admin or assigned case_worker)
  router.put('/loved-ones/:id', authMiddleware, (req, res) => {
    lovedOneController.updateLovedOne(req, res, driver, auditLogger);
  });
}

module.exports = setupLovedOnesRoutes;

