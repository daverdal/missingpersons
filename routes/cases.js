const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');

/**
 * Case/Applicant routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupCaseRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole, caseEventModel, smsService, upload, neo4jDatabase } = dependencies;

  // GET /api/cases - Get all cases/applicants
  router.get('/cases', authMiddleware, (req, res) => {
    caseController.getAllCases(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/applicants/search - Search applicants by name
  router.get('/applicants/search', authMiddleware, (req, res) => {
    caseController.searchApplicants(req, res, driver, auditLogger, neo4jDatabase);
  });

  // IMPORTANT: Specific routes must come BEFORE parameterized routes like /applicants/:id
  // GET /api/applicants/with-phone-numbers - Get applicants with phone numbers (admin only)
  router.get('/applicants/with-phone-numbers', authMiddleware, requireRole('admin'), (req, res) => {
    caseController.getApplicantsWithPhoneNumbers(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/applicants/with-email-addresses - Get applicants with email addresses (admin only)
  router.get('/applicants/with-email-addresses', authMiddleware, requireRole('admin'), (req, res) => {
    caseController.getApplicantsWithEmailAddresses(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/applicants/by-province - Get applicants by province
  router.get('/applicants/by-province', authMiddleware, (req, res) => {
    caseController.getApplicantsByProvince(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/applicants/:id/complete - Get applicant with all related data (must come before /applicants/:id)
  router.get('/applicants/:id/complete', authMiddleware, (req, res) => {
    caseController.getApplicantComplete(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/applicants/:id - Get applicant by ID (parameterized route - must come last)
  router.get('/applicants/:id', authMiddleware, (req, res) => {
    caseController.getApplicantById(req, res, driver, auditLogger, neo4jDatabase);
  });

  // PUT /api/applicants/:id - Update applicant
  router.put('/applicants/:id', authMiddleware, (req, res) => {
    caseController.updateApplicant(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/my-cases - Get cases assigned to current user
  router.get('/my-cases', authMiddleware, (req, res) => {
    caseController.getMyCases(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/case-worker/:email/cases - Get cases assigned to a specific case worker
  router.get('/case-worker/:email/cases', authMiddleware, (req, res) => {
    caseController.getCaseWorkerCases(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/intake - Create new case via intake form
  router.post('/intake', authMiddleware, (req, res) => {
    caseController.createIntake(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/cases/:caseId/assign - Assign case to case worker (admin only)
  router.post('/cases/:caseId/assign', authMiddleware, requireRole('admin'), (req, res) => {
    caseController.assignCase(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/cases/:caseId/unassign - Unassign all case workers from case (admin only)
  router.post('/cases/:caseId/unassign', authMiddleware, requireRole('admin'), (req, res) => {
    caseController.unassignCase(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/cases/:caseId/events - Add event to case
  router.post('/cases/:caseId/events', authMiddleware, (req, res, next) => {
    // Only allow 'admin' or 'case_worker' roles
    const roles = req.user && (req.user.roles || req.user.groups || []);
    if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
      return next();
    }
    auditLogger.log(req, {
      action: 'case.event_create',
      resourceType: 'case',
      resourceId: req.params?.caseId || null,
      success: false,
      message: 'Forbidden: insufficient role'
    }).then(() => {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
    });
  }, (req, res) => {
    caseController.addCaseEvent(req, res, caseEventModel, auditLogger);
  });

  // GET /api/cases/:caseId/events - Get all events for a case
  router.get('/cases/:caseId/events', authMiddleware, (req, res) => {
    caseController.getCaseEvents(req, res, caseEventModel, auditLogger);
  });

  // POST /api/cases/:caseId/sms - Send SMS for a case
  router.post('/cases/:caseId/sms', authMiddleware, (req, res) => {
    caseController.sendCaseSms(req, res, driver, smsService, caseEventModel, auditLogger, neo4jDatabase);
  });

  // GET /api/cases/:caseId/files - Get all files for a case
  router.get('/cases/:caseId/files', authMiddleware, (req, res) => {
    caseController.getCaseFiles(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/cases/:caseId/upload - Upload file for a case
  router.post('/cases/:caseId/upload', authMiddleware, (req, res, next) => {
    // Only allow 'admin' or 'case_worker' roles
    const roles = req.user && (req.user.roles || req.user.groups || []);
    if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
      return next();
    }
    auditLogger.log(req, {
      action: 'case.file_upload',
      resourceType: 'case',
      resourceId: req.params?.caseId || null,
      success: false,
      message: 'Forbidden: insufficient role'
    }).then(() => {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
    });
  }, upload.single('file'), (req, res) => {
    caseController.uploadCaseFile(req, res, driver, upload, auditLogger, neo4jDatabase);
  });

  // DELETE /api/cases/:caseId/files/:filename - Delete file for a case
  router.delete('/cases/:caseId/files/:filename', authMiddleware, (req, res) => {
    caseController.deleteCaseFile(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/cases/:caseId/notes - Get all notes for a case
  router.get('/cases/:caseId/notes', authMiddleware, (req, res) => {
    caseController.getCaseNotes(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/cases/:caseId/notes - Add note to a case
  router.post('/cases/:caseId/notes', authMiddleware, (req, res) => {
    caseController.addCaseNote(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/applicants/:id/loved-ones - Add loved one to applicant
  router.post('/applicants/:id/loved-ones', authMiddleware, (req, res) => {
    caseController.addLovedOne(req, res, driver, auditLogger, neo4jDatabase);
  });
}

module.exports = setupCaseRoutes;

