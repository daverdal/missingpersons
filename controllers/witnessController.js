/**
 * Witness Controller
 * Handles all witness-related operations
 */

/**
 * Get all witnesses with optional filters
 */
async function getWitnesses(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const {
      relatedToType,
      relatedToId,
      reportedTo,
      createdBy
    } = req.query;

    const filters = {};
    if (relatedToType) filters.relatedToType = relatedToType;
    if (relatedToId) filters.relatedToId = relatedToId;
    if (reportedTo) filters.reportedTo = reportedTo;
    if (createdBy) filters.createdBy = createdBy;

    const WitnessModel = require('../witnessModel');
    const witnessModel = new WitnessModel(driver);
    const witnesses = await witnessModel.getWitnesses(filters);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.get_all',
        resourceType: 'witness',
        success: true,
        details: { count: witnesses.length, filters }
      });
    }

    res.json({ witnesses });
  } catch (err) {
    console.error('Failed to fetch witnesses:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.get_all',
        resourceType: 'witness',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch witnesses' });
  } finally {
    await session.close();
  }
}

/**
 * Get witness by ID
 */
async function getWitnessById(req, res, driver, auditLogger) {
  const { witnessId } = req.params;
  const session = driver.session();
  try {
    const WitnessModel = require('../witnessModel');
    const witnessModel = new WitnessModel(driver);
    const witness = await witnessModel.getWitnessById(witnessId);

    if (!witness) {
      return res.status(404).json({ error: 'Witness not found' });
    }

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.get_by_id',
        resourceType: 'witness',
        resourceId: witnessId,
        success: true
      });
    }

    res.json({ witness });
  } catch (err) {
    console.error('Failed to fetch witness:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.get_by_id',
        resourceType: 'witness',
        resourceId: req.params.witnessId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch witness' });
  } finally {
    await session.close();
  }
}

/**
 * Create a new witness
 */
async function createWitness(req, res, driver, auditLogger) {
  const {
    name,
    contact,
    address,
    statement,
    dateOfStatement,
    relatedToType,
    relatedToId,
    reportedTo,
    metadata
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const session = driver.session();
  try {
    const WitnessModel = require('../witnessModel');
    const witnessModel = new WitnessModel(driver);

    const createdBy = req.user?.email || req.user?.preferred_username || req.user?.name || 'system';
    // Automatically use logged-in user as reportedTo if not provided
    const reportedToEmail = reportedTo || createdBy;
    
    const witness = await witnessModel.createWitness({
      name: name.trim(),
      contact: contact || null,
      address: address || null,
      statement: statement || null,
      dateOfStatement: dateOfStatement || new Date().toISOString(),
      createdBy,
      relatedToType: relatedToType || null,
      relatedToId: relatedToId || null,
      reportedTo: reportedToEmail,
      metadata: metadata || null
    });

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.create',
        resourceType: 'witness',
        resourceId: witness.witnessId,
        success: true,
        details: { name: witness.name, relatedToType, relatedToId }
      });
    }

    res.status(201).json({ witness });
  } catch (err) {
    console.error('Failed to create witness:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.create',
        resourceType: 'witness',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to create witness' });
  } finally {
    await session.close();
  }
}

/**
 * Update a witness
 */
async function updateWitness(req, res, driver, auditLogger) {
  const { witnessId } = req.params;
  const {
    name,
    contact,
    address,
    statement,
    dateOfStatement,
    relatedToType,
    relatedToId,
    reportedTo,
    metadata
  } = req.body;

  const session = driver.session();
  try {
    const WitnessModel = require('../witnessModel');
    const witnessModel = new WitnessModel(driver);

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (contact !== undefined) updates.contact = contact;
    if (address !== undefined) updates.address = address;
    if (statement !== undefined) updates.statement = statement;
    if (dateOfStatement !== undefined) updates.dateOfStatement = dateOfStatement;
    if (relatedToType !== undefined) updates.relatedToType = relatedToType;
    if (relatedToId !== undefined) updates.relatedToId = relatedToId;
    // Automatically use logged-in user as reportedTo if not provided
    const currentUserEmail = req.user?.email || req.user?.preferred_username || null;
    if (reportedTo !== undefined) {
      updates.reportedTo = reportedTo || currentUserEmail;
    }
    if (metadata !== undefined) updates.metadata = metadata;

    const witness = await witnessModel.updateWitness(witnessId, updates);

    if (!witness) {
      return res.status(404).json({ error: 'Witness not found' });
    }

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.update',
        resourceType: 'witness',
        resourceId: witnessId,
        success: true,
        details: { updatedFields: Object.keys(updates) }
      });
    }

    res.json({ witness });
  } catch (err) {
    console.error('Failed to update witness:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.update',
        resourceType: 'witness',
        resourceId: witnessId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to update witness' });
  } finally {
    await session.close();
  }
}

/**
 * Delete a witness
 */
async function deleteWitness(req, res, driver, auditLogger) {
  const { witnessId } = req.params;
  const session = driver.session();
  try {
    const WitnessModel = require('../witnessModel');
    const witnessModel = new WitnessModel(driver);

    await witnessModel.deleteWitness(witnessId);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.delete',
        resourceType: 'witness',
        resourceId: witnessId,
        success: true
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete witness:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'witness.delete',
        resourceType: 'witness',
        resourceId: witnessId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to delete witness' });
  } finally {
    await session.close();
  }
}

module.exports = {
  getWitnesses,
  getWitnessById,
  createWitness,
  updateWitness,
  deleteWitness
};

