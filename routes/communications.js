/**
 * Communication Routes
 * Handles SMS and Email communication endpoints
 */

const express = require('express');
const communicationController = require('../controllers/communicationController');

function setupCommunicationRoutes(router, dependencies) {
  const { driver, configModel, smsService, caseEventModel, auditLogger, authMiddleware, requireRole } = dependencies;

  // GET /api/email-settings - Get email settings
  router.get('/email-settings', authMiddleware, requireRole('admin'), (req, res) => {
    communicationController.getEmailSettings(req, res, configModel, auditLogger);
  });

  // POST /api/email-settings - Save email settings
  router.post('/email-settings', authMiddleware, requireRole('admin'), (req, res) => {
    communicationController.saveEmailSettings(req, res, configModel, auditLogger);
  });

  // POST /api/sms-blast - Send SMS blast to all opted-in applicants
  router.post('/sms-blast', authMiddleware, requireRole('admin'), (req, res) => {
    communicationController.sendSmsBlast(req, res, driver, smsService, caseEventModel, auditLogger);
  });

  // GET /api/email-blast/progress/:jobId - Get email blast progress
  router.get('/email-blast/progress/:jobId', authMiddleware, requireRole('admin'), (req, res) => {
    communicationController.getEmailBlastProgress(req, res, auditLogger);
  });

  // POST /api/email-blast - Send email blast to all opted-in applicants
  router.post('/email-blast', authMiddleware, requireRole('admin'), (req, res) => {
    communicationController.sendEmailBlast(req, res, driver, configModel, caseEventModel, auditLogger);
  });
}

module.exports = setupCommunicationRoutes;

