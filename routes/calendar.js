/**
 * Calendar Routes
 * Handles all calendar-related endpoints
 */

const express = require('express');
const calendarController = require('../controllers/calendarController');

function setupCalendarRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole } = dependencies;

  // GET /api/calendar/events - Get all calendar events for a date range
  router.get('/calendar/events', authMiddleware, (req, res) => {
    calendarController.getCalendarEvents(req, res, driver, auditLogger);
  });
}

module.exports = setupCalendarRoutes;

