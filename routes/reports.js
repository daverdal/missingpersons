/**
 * Reports Routes
 * Handles all report-related endpoints (admin only)
 */

const express = require('express');
const reportsController = require('../controllers/reportsController');

function setupReportsRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole } = dependencies;

  // GET /api/reports/case-statistics - Get case statistics report (admin only)
  router.get('/reports/case-statistics', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getCaseStatisticsReport(req, res, driver, auditLogger);
  });

  // GET /api/reports/caseworker-activity - Get caseworker activity report (admin only)
  router.get('/reports/caseworker-activity', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getCaseworkerActivityReport(req, res, driver, auditLogger);
  });

  // GET /api/reports/case-detail-export - Get detailed case export (admin only)
  router.get('/reports/case-detail-export', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getCaseDetailExport(req, res, driver, auditLogger);
  });

  // GET /api/reports/community - Get community report for First Nation Chief (admin only)
  router.get('/reports/community', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getCommunityReport(req, res, driver, auditLogger);
  });

  // GET /api/reports/workload-distribution - Get workload distribution report (admin only)
  router.get('/reports/workload-distribution', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getWorkloadDistributionReport(req, res, driver, auditLogger);
  });

  // GET /api/reports/missing-person-demographics - Get missing person demographics report (admin only)
  router.get('/reports/missing-person-demographics', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getMissingPersonDemographicsReport(req, res, driver, auditLogger);
  });

  // GET /api/reports/witness - Get witness report (admin only)
  router.get('/reports/witness', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getWitnessReport(req, res, driver, auditLogger);
  });

  // GET /api/reports/family - Get family report (admin only)
  router.get('/reports/family', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getFamilyReport(req, res, driver, auditLogger);
  });

  // GET /api/reports/communications - Get communications report (admin only)
  router.get('/reports/communications', authMiddleware, requireRole('admin'), (req, res) => {
    reportsController.getCommunicationsReport(req, res, driver, auditLogger);
  });
}

module.exports = setupReportsRoutes;

