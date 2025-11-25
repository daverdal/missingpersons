const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');

/**
 * Reminder routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupReminderRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole } = dependencies;

  // GET /api/reminders - Get all reminders with optional filters
  router.get('/reminders', authMiddleware, (req, res) => {
    reminderController.getReminders(req, res, driver, auditLogger);
  });

  // GET /api/reminders/upcoming - Get upcoming reminders (next 7 days by default)
  router.get('/reminders/upcoming', authMiddleware, (req, res) => {
    reminderController.getUpcomingReminders(req, res, driver, auditLogger);
  });

  // GET /api/reminders/:reminderId - Get reminder by ID
  router.get('/reminders/:reminderId', authMiddleware, (req, res) => {
    reminderController.getReminderById(req, res, driver, auditLogger);
  });

  // POST /api/reminders - Create a new reminder
  router.post('/reminders', authMiddleware, (req, res) => {
    reminderController.createReminder(req, res, driver, auditLogger);
  });

  // PUT /api/reminders/:reminderId - Update a reminder
  router.put('/reminders/:reminderId', authMiddleware, (req, res) => {
    reminderController.updateReminder(req, res, driver, auditLogger);
  });

  // DELETE /api/reminders/:reminderId - Delete a reminder
  router.delete('/reminders/:reminderId', authMiddleware, (req, res) => {
    reminderController.deleteReminder(req, res, driver, auditLogger);
  });
}

module.exports = setupReminderRoutes;

