const express = require('express');
const router = express.Router();
const timelineController = require('../controllers/timelineController');

/**
 * Timeline routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupTimelineRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole, neo4jDatabase } = dependencies;

  // GET /api/timeline/events - Get all timeline events (global timeline)
  router.get('/timeline/events', authMiddleware, (req, res) => {
    timelineController.getAllTimelineEvents(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/timeline/events/grouped - Get events grouped by LovedOne (for visualization)
  router.get('/timeline/events/grouped', authMiddleware, (req, res) => {
    timelineController.getTimelineEventsGrouped(req, res, driver, auditLogger, neo4jDatabase);
  });

  // GET /api/timeline/loved-ones/:lovedOneId/events - Get events for a specific LovedOne
  router.get('/timeline/loved-ones/:lovedOneId/events', authMiddleware, (req, res) => {
    timelineController.getLovedOneTimelineEvents(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/timeline/loved-ones/:lovedOneId/events - Create a new timeline event
  router.post('/timeline/loved-ones/:lovedOneId/events', authMiddleware, (req, res) => {
    timelineController.createTimelineEvent(req, res, driver, auditLogger, neo4jDatabase);
  });

  // PUT /api/timeline/events/:eventId - Update an existing timeline event
  router.put('/timeline/events/:eventId', authMiddleware, (req, res) => {
    timelineController.updateTimelineEvent(req, res, driver, auditLogger, neo4jDatabase);
  });

  // DELETE /api/timeline/events/:eventId - Delete a timeline event
  router.delete('/timeline/events/:eventId', authMiddleware, (req, res) => {
    timelineController.deleteTimelineEvent(req, res, driver, auditLogger, neo4jDatabase);
  });

  // POST /api/timeline/backfill - Backfill CaseOpened events for existing LovedOnes (admin only)
  router.post('/timeline/backfill', authMiddleware, requireRole('admin'), (req, res) => {
    timelineController.backfillCaseOpenedEvents(req, res, driver, auditLogger, neo4jDatabase);
  });
}

module.exports = setupTimelineRoutes;

