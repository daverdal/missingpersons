const express = require('express');
const router = express.Router();
const photoController = require('../controllers/photoController');

/**
 * Photo routes for LovedOnes
 * All routes require authentication via authMiddleware (passed from server.js)
 */

function setupPhotoRoutes(router, dependencies) {
  const { driver, auditLogger, upload, authMiddleware } = dependencies;

  // GET /api/loved-ones/:id/photos - Get all photos for a LovedOne
  router.get('/loved-ones/:id/photos', authMiddleware, (req, res) => {
    photoController.getPhotos(req, res, driver, auditLogger);
  });

  // POST /api/loved-ones/:id/photos - Upload a photo for a LovedOne
  router.post('/loved-ones/:id/photos',
    authMiddleware,
    (req, res, next) => photoController.requirePhotoPermission(req, res, next, auditLogger),
    upload.single('photo'),
    (req, res) => {
      photoController.uploadPhoto(req, res, driver, auditLogger);
    }
  );

  // DELETE /api/loved-ones/:id/photos/:filename - Delete a photo for a LovedOne
  router.delete('/loved-ones/:id/photos/:filename', 
    authMiddleware,
    (req, res, next) => photoController.requirePhotoPermission(req, res, next, auditLogger),
    (req, res) => {
      photoController.deletePhoto(req, res, driver, auditLogger);
    }
  );

  return router;
}

module.exports = setupPhotoRoutes;

