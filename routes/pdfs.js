const express = require('express');
const router = express.Router();
const pdfController = require('../controllers/pdfController');

/**
 * PDF export routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupPdfRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware } = dependencies;

  // GET /api/applicants/:id/export-pdf - Export case details to PDF
  router.get('/applicants/:id/export-pdf', authMiddleware, (req, res) => {
    pdfController.generateCaseDetailsPDF(req, res, driver, auditLogger);
  });

  // GET /api/intake/export-pdf - Export blank intake form to PDF
  router.get('/intake/export-pdf', authMiddleware, (req, res) => {
    pdfController.generateBlankIntakeFormPDF(req, res, auditLogger);
  });

  return router;
}

module.exports = setupPdfRoutes;

