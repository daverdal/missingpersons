/**
 * Public Routes
 * Exposes unauthenticated endpoints for the external website.
 * Also includes authenticated endpoints for viewing inquiries (admin/case_worker only).
 */

const publicController = require('../controllers/publicController');

function setupPublicRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware } = dependencies;

  // Unauthenticated public endpoints
  router.get('/public/loved-ones', (req, res) => {
    publicController.getPublicLovedOnes(req, res, driver);
  });

  router.post('/public/contact', (req, res) => {
    publicController.submitContactInquiry(req, res, driver, auditLogger);
  });

  // Authenticated endpoints for viewing inquiries (admin/case_worker only)
  router.get('/public/inquiries', authMiddleware, (req, res) => {
    publicController.getPublicInquiries(req, res, driver, auditLogger);
  });

  router.put('/public/inquiries/:id/status', authMiddleware, (req, res) => {
    publicController.updatePublicInquiryStatus(req, res, driver, auditLogger);
  });
}

module.exports = setupPublicRoutes;


