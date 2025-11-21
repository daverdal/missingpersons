const path = require('path');
const fs = require('fs');

/**
 * Get all photos for a LovedOne
 */
async function getPhotos(req, res, driver, auditLogger) {
  const { id } = req.params;
  const session = driver.session();
  try {
    // First, let's check all files linked to this LovedOne
    const debugResult = await session.run(
      `MATCH (l:LovedOne {id: $id})-[r:HAS_PHOTO]->(f:File)
       RETURN f, r, l.id as lovedOneId`,
      { id }
    );
    console.log(`[GET /api/loved-ones/${id}/photos] DEBUG: Found ${debugResult.records.length} HAS_PHOTO relationships`);
    debugResult.records.forEach((record, idx) => {
      const file = record.get('f').properties;
      console.log(`  [${idx + 1}] File: ${file.filename}, type: ${file.type}, mimetype: ${file.mimetype}`);
    });
    
    const result = await session.run(
      `MATCH (l:LovedOne {id: $id})-[:HAS_PHOTO]->(f:File)
       WHERE f.type = 'photo' OR f.mimetype STARTS WITH 'image/'
       RETURN f ORDER BY f.uploadedAt DESC`,
      { id }
    );
    const photos = result.records.map(r => r.get('f').properties);
    console.log(`[GET /api/loved-ones/${id}/photos] Query returned ${photos.length} photos after filtering`);
    // Prevent caching to ensure fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({ photos });
  } catch (err) {
    console.error('Failed to fetch photos:', err);
    res.status(500).json({ error: 'Failed to fetch photos' });
  } finally {
    await session.close();
  }
}

/**
 * Upload a photo for a LovedOne
 */
async function uploadPhoto(req, res, driver, auditLogger) {
  const { id } = req.params;
  console.log(`[POST /api/loved-ones/${id}/photos] Processing upload, file:`, req.file ? req.file.originalname : 'NO FILE');
  
  // Handle multer errors (file size, etc.)
  if (req.fileValidationError) {
    console.log(`[POST /api/loved-ones/${id}/photos] File validation error:`, req.fileValidationError);
    await auditLogger.log(req, {
      action: 'loved_one.photo_upload',
      resourceType: 'loved_one',
      resourceId: id,
      success: false,
      message: req.fileValidationError
    });
    return res.status(400).json({ error: req.fileValidationError, details: 'File validation failed' });
  }
  
  if (!req.file) {
    console.log(`[POST /api/loved-ones/${id}/photos] ERROR: No file in request`);
    await auditLogger.log(req, {
      action: 'loved_one.photo_upload',
      resourceType: 'loved_one',
      resourceId: id,
      success: false,
      message: 'No file uploaded'
    });
    return res.status(400).json({ error: 'No file uploaded', details: 'Please select a file to upload' });
  }

  // Verify it's an image file
  if (!req.file.mimetype.startsWith('image/')) {
    await auditLogger.log(req, {
      action: 'loved_one.photo_upload',
      resourceType: 'loved_one',
      resourceId: id,
      success: false,
      message: 'File must be an image'
    });
    return res.status(400).json({ error: 'File must be an image' });
  }

  const session = driver.session();
  try {
    // Verify LovedOne exists
    const checkResult = await session.run(
      'MATCH (l:LovedOne {id: $id}) RETURN l',
      { id }
    );
    if (checkResult.records.length === 0) {
      await session.close();
      await auditLogger.log(req, {
        action: 'loved_one.photo_upload',
        resourceType: 'loved_one',
        resourceId: id,
        success: false,
        message: 'LovedOne not found'
      });
      return res.status(404).json({ error: 'LovedOne not found' });
    }

    // Save file metadata and link to LovedOne
    const fileMeta = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      type: 'photo',
      uploadedBy: req.user.email || req.user.name,
      uploadedAt: new Date().toISOString()
    };

    // Create File node and link to LovedOne with HAS_PHOTO relationship
    const createResult = await session.run(
      `MATCH (l:LovedOne {id: $id})
      CREATE (f:File {
        filename: $filename, 
        originalname: $originalname, 
        path: $path, 
        mimetype: $mimetype, 
        size: $size, 
        type: $type,
        uploadedBy: $uploadedBy, 
        uploadedAt: $uploadedAt
      })
      CREATE (l)-[:HAS_PHOTO]->(f)
      RETURN f, l.id as lovedOneId`,
      { id, ...fileMeta }
    );
    
    if (createResult.records.length === 0) {
      throw new Error('Failed to create photo node');
    }
    
    const createdFile = createResult.records[0].get('f').properties;
    console.log(`[POST /api/loved-ones/${id}/photos] Created photo file: ${fileMeta.filename}`);
    console.log(`[POST /api/loved-ones/${id}/photos] Created file node with properties:`, createdFile);
    
    // Verify the relationship was created
    const verifyResult = await session.run(
      `MATCH (l:LovedOne {id: $id})-[r:HAS_PHOTO]->(f:File)
       RETURN count(r) as photoCount`,
      { id }
    );
    const photoCount = verifyResult.records[0]?.get('photoCount')?.toNumber() || 0;
    console.log(`[POST /api/loved-ones/${id}/photos] Total photos for this LovedOne after upload: ${photoCount}`);

    await auditLogger.log(req, {
      action: 'loved_one.photo_upload',
      resourceType: 'loved_one',
      resourceId: id,
      success: true,
      details: {
        filename: fileMeta.filename,
        originalname: fileMeta.originalname,
        size: fileMeta.size
      }
    });
    res.json({ success: true, photo: fileMeta });
  } catch (err) {
    console.error('Failed to save photo metadata:', err);
    await auditLogger.log(req, {
      action: 'loved_one.photo_upload',
      resourceType: 'loved_one',
      resourceId: id,
      success: false,
      message: 'Failed to save photo metadata',
      details: { error: err.message }
    });
    res.status(500).json({ 
      error: 'Failed to save photo metadata', 
      details: err.message || 'Database error occurred while saving photo'
    });
  } finally {
    await session.close();
  }
}

/**
 * Delete a photo for a LovedOne
 */
async function deletePhoto(req, res, driver, auditLogger) {
  const { id, filename } = req.params;
  const session = driver.session();
  try {
    // Find and delete File node and relationship
    const result = await session.run(
      `MATCH (l:LovedOne {id: $id})-[r:HAS_PHOTO]->(f:File {filename: $filename})
       DELETE r, f
       RETURN f`,
      { id, filename }
    );

    if (result.records.length === 0) {
      await session.close();
      await auditLogger.log(req, {
        action: 'loved_one.photo_delete',
        resourceType: 'loved_one',
        resourceId: id,
        success: false,
        message: 'Photo not found'
      });
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Delete physical file
    const filePath = path.join(__dirname, '..', 'uploads', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await auditLogger.log(req, {
      action: 'loved_one.photo_delete',
      resourceType: 'loved_one',
      resourceId: id,
      success: true,
      details: { filename }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete photo:', err);
    await auditLogger.log(req, {
      action: 'loved_one.photo_delete',
      resourceType: 'loved_one',
      resourceId: id,
      success: false,
      message: 'Failed to delete photo',
      details: { filename, error: err.message }
    });
    res.status(500).json({ error: 'Failed to delete photo' });
  } finally {
    await session.close();
  }
}

/**
 * Middleware to check if user has permission to upload/delete photos
 */
async function requirePhotoPermission(req, res, next, auditLogger) {
  const roles = req.user && (req.user.roles || req.user.groups || []);
  if (Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'))) {
    return next();
  }
  const action = req.method === 'POST' ? 'loved_one.photo_upload' : 'loved_one.photo_delete';
  await auditLogger.log(req, {
    action,
    resourceType: 'loved_one',
    resourceId: req.params?.id || null,
    success: false,
    message: 'Forbidden: insufficient role'
  });
  return res.status(403).json({ error: 'Forbidden: insufficient role' });
}

module.exports = {
  getPhotos,
  uploadPhoto,
  deletePhoto,
  requirePhotoPermission
};

