const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

/**
 * User management routes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupUserRoutes(router, dependencies) {
  const { driver, auditLogger, authMiddleware, requireRole, userModel } = dependencies;

  // GET /api/me - Get current user info
  router.get('/me', authMiddleware, (req, res) => {
    userController.getCurrentUser(req, res, userModel, auditLogger);
  });

  // GET /api/users - List all users (admin only)
  router.get('/users', authMiddleware, requireRole('admin'), (req, res) => {
    userController.getAllUsers(req, res, userModel, auditLogger);
  });

  // POST /api/users - Create a new user (admin only)
  router.post('/users', authMiddleware, requireRole('admin'), (req, res) => {
    userController.createUser(req, res, userModel, auditLogger);
  });

  // PUT /api/users/:email/roles - Update user roles (admin only)
  router.put('/users/:email/roles', authMiddleware, requireRole('admin'), (req, res) => {
    userController.updateUserRoles(req, res, userModel, auditLogger);
  });

  // POST /api/users/:email/promote - Promote user to admin
  router.post('/users/:email/promote', authMiddleware, requireRole('admin'), (req, res) => {
    userController.promoteUser(req, res, userModel, auditLogger);
  });

  // POST /api/users/:email/demote - Demote user to case_worker
  router.post('/users/:email/demote', authMiddleware, requireRole('admin'), (req, res) => {
    userController.demoteUser(req, res, userModel, auditLogger);
  });

  // DELETE /api/users/:email - Delete user (admin only)
  router.delete('/users/:email', authMiddleware, requireRole('admin'), (req, res) => {
    userController.deleteUser(req, res, driver, auditLogger);
  });

  // GET /api/user/preferences - Get current user's preferences
  router.get('/user/preferences', authMiddleware, (req, res) => {
    userController.getUserPreferences(req, res, userModel, auditLogger);
  });

  // PUT /api/user/preferences - Update current user's preferences
  router.put('/user/preferences', authMiddleware, (req, res) => {
    userController.updateUserPreferences(req, res, userModel, auditLogger);
  });
}

module.exports = setupUserRoutes;

