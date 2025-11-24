/**
 * Status Controller
 * Handles Client Status and LovedOne Status management operations
 */

/**
 * Get all client statuses
 */
async function getClientStatuses(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (s:ClientStatus) RETURN s ORDER BY s.name');
    const statuses = result.records.map(r => r.get('s').properties);
    await session.close();
    res.json({ statuses });
  } catch (err) {
    await session.close();
    console.error('Failed to fetch client statuses:', err);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
}

/**
 * Create a new client status
 */
async function createClientStatus(req, res, driver, auditLogger) {
  const { name } = req.body;
  if (!name || !name.trim()) {
    await auditLogger.log(req, {
      action: 'clientStatus.create',
      resourceType: 'clientStatus',
      resourceId: null,
      success: false,
      message: 'Name is required'
    });
    return res.status(400).json({ error: 'Name is required' });
  }
  const trimmedName = name.trim();
  const session = driver.session();
  try {
    // Check for duplicate
    const exists = await session.run('MATCH (s:ClientStatus {name: $name}) RETURN s', { name: trimmedName });
    if (exists.records.length) {
      const status = exists.records[0].get('s').properties;
      if (status.active === false) {
        // Reactivate if inactive
        await session.run('MATCH (s:ClientStatus {name: $name}) SET s.active = true', { name: trimmedName });
        await session.close();
        await auditLogger.log(req, {
          action: 'clientStatus.reactivate',
          resourceType: 'clientStatus',
          resourceId: trimmedName,
          success: true
        });
        return res.json({ success: true, reactivated: true });
      }
      await session.close();
      await auditLogger.log(req, {
        action: 'clientStatus.create',
        resourceType: 'clientStatus',
        resourceId: trimmedName,
        success: false,
        message: 'Status already exists'
      });
      return res.status(409).json({ error: 'Status already exists' });
    }
    await session.run('CREATE (s:ClientStatus {name: $name, active: true})', { name: trimmedName });
    await session.close();
    await auditLogger.log(req, {
      action: 'clientStatus.create',
      resourceType: 'clientStatus',
      resourceId: trimmedName,
      success: true
    });
    res.json({ success: true });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'clientStatus.create',
      resourceType: 'clientStatus',
      resourceId: trimmedName,
      success: false,
      message: err.message
    });
    console.error('Failed to create client status:', err);
    res.status(500).json({ error: 'Failed to create status' });
  }
}

/**
 * Delete a client status (soft delete by setting active: false)
 */
async function deleteClientStatus(req, res, driver, auditLogger) {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const trimmedName = name.trim();
  const session = driver.session();
  try {
    // Soft delete by setting active: false
    const result = await session.run(
      'MATCH (s:ClientStatus {name: $name}) SET s.active = false RETURN s',
      { name: trimmedName }
    );
    if (result.records.length === 0) {
      await session.close();
      return res.status(404).json({ error: 'Status not found' });
    }
    await session.close();
    await auditLogger.log(req, {
      action: 'clientStatus.delete',
      resourceType: 'clientStatus',
      resourceId: trimmedName,
      success: true
    });
    res.json({ success: true });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'clientStatus.delete',
      resourceType: 'clientStatus',
      resourceId: trimmedName,
      success: false,
      message: err.message
    });
    console.error('Failed to delete client status:', err);
    res.status(500).json({ error: 'Failed to delete status' });
  }
}

/**
 * Get all loved one statuses
 */
async function getLovedOneStatuses(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (s:LovedOneStatus) RETURN s ORDER BY s.name');
    const statuses = result.records.map(r => r.get('s').properties);
    await session.close();
    res.json({ statuses });
  } catch (err) {
    await session.close();
    console.error('Failed to fetch loved one statuses:', err);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
}

/**
 * Create a new loved one status
 */
async function createLovedOneStatus(req, res, driver, auditLogger) {
  const { name } = req.body;
  if (!name || !name.trim()) {
    await auditLogger.log(req, {
      action: 'lovedOneStatus.create',
      resourceType: 'lovedOneStatus',
      resourceId: null,
      success: false,
      message: 'Name is required'
    });
    return res.status(400).json({ error: 'Name is required' });
  }
  const trimmedName = name.trim();
  const session = driver.session();
  try {
    // Check for duplicate
    const exists = await session.run('MATCH (s:LovedOneStatus {name: $name}) RETURN s', { name: trimmedName });
    if (exists.records.length) {
      const status = exists.records[0].get('s').properties;
      if (status.active === false) {
        // Reactivate if inactive
        await session.run('MATCH (s:LovedOneStatus {name: $name}) SET s.active = true', { name: trimmedName });
        await session.close();
        await auditLogger.log(req, {
          action: 'lovedOneStatus.reactivate',
          resourceType: 'lovedOneStatus',
          resourceId: trimmedName,
          success: true
        });
        return res.json({ success: true, reactivated: true });
      }
      await session.close();
      await auditLogger.log(req, {
        action: 'lovedOneStatus.create',
        resourceType: 'lovedOneStatus',
        resourceId: trimmedName,
        success: false,
        message: 'Status already exists'
      });
      return res.status(409).json({ error: 'Status already exists' });
    }
    await session.run('CREATE (s:LovedOneStatus {name: $name, active: true})', { name: trimmedName });
    await session.close();
    await auditLogger.log(req, {
      action: 'lovedOneStatus.create',
      resourceType: 'lovedOneStatus',
      resourceId: trimmedName,
      success: true
    });
    res.json({ success: true });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'lovedOneStatus.create',
      resourceType: 'lovedOneStatus',
      resourceId: trimmedName,
      success: false,
      message: err.message
    });
    console.error('Failed to create loved one status:', err);
    res.status(500).json({ error: 'Failed to create status' });
  }
}

/**
 * Delete a loved one status (soft delete by setting active: false)
 */
async function deleteLovedOneStatus(req, res, driver, auditLogger) {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const trimmedName = name.trim();
  const session = driver.session();
  try {
    // Soft delete by setting active: false
    const result = await session.run(
      'MATCH (s:LovedOneStatus {name: $name}) SET s.active = false RETURN s',
      { name: trimmedName }
    );
    if (result.records.length === 0) {
      await session.close();
      return res.status(404).json({ error: 'Status not found' });
    }
    await session.close();
    await auditLogger.log(req, {
      action: 'lovedOneStatus.delete',
      resourceType: 'lovedOneStatus',
      resourceId: trimmedName,
      success: true
    });
    res.json({ success: true });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'lovedOneStatus.delete',
      resourceType: 'lovedOneStatus',
      resourceId: trimmedName,
      success: false,
      message: err.message
    });
    console.error('Failed to delete loved one status:', err);
    res.status(500).json({ error: 'Failed to delete status' });
  }
}

module.exports = {
  getClientStatuses,
  createClientStatus,
  deleteClientStatus,
  getLovedOneStatuses,
  createLovedOneStatus,
  deleteLovedOneStatus
};

