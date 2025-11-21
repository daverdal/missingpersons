/**
 * Community Controller
 * Handles business logic for communities (First Nations)
 */

/**
 * Get all communities
 */
async function getCommunities(req, res, driver, auditLogger, database) {
  let session = driver.session({ database });
  let actualDatabase = database;
  try {
    // Test if database exists
    await session.run('RETURN 1');
  } catch (err) {
    if (err.message && err.message.includes('does not exist') && database !== 'neo4j') {
      console.log(`[getCommunities] Database '${database}' does not exist. Trying 'neo4j' instead...`);
      await session.close();
      actualDatabase = 'neo4j';
      session = driver.session({ database: actualDatabase });
    } else {
      console.error('[getCommunities] Error connecting to database:', err);
      return res.status(500).json({ error: 'Failed to connect to database', details: err.message });
    }
  }

  try {
    console.log(`[getCommunities] Querying communities from database: ${actualDatabase}`);
    const result = await session.run('MATCH (c:Community) RETURN c ORDER BY c.name');
    const communities = result.records.map(r => r.get('c').properties);
    console.log(`[getCommunities] Found ${communities.length} communities`);
    res.json({ communities });
  } catch (err) {
    console.error('[getCommunities] Failed to fetch communities:', err);
    res.status(500).json({ error: 'Failed to fetch communities', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Create or update a community
 */
async function createOrUpdateCommunity(req, res, driver, auditLogger, database) {
  const { name, band_number, address, phone, fax, latitude, longitude, id } = req.body;
  console.log('POST /api/communities called with:', req.body);
  if (!name) {
    await auditLogger.log(req, {
      action: 'community.create',
      resourceType: 'community',
      resourceId: null,
      success: false,
      message: 'Name is required'
    });
    return res.status(400).json({ error: 'Name is required' });
  }
  let session = driver.session({ database });
  let actualDatabase = database;
  try {
    // Test if database exists
    await session.run('RETURN 1');
  } catch (err) {
    if (err.message && err.message.includes('does not exist') && database !== 'neo4j') {
      await session.close();
      actualDatabase = 'neo4j';
      session = driver.session({ database: actualDatabase });
    } else {
      throw err;
    }
  }

  try {
    // If id is provided, update existing community
    if (id) {
      const updateProps = { id, name };
      if (band_number !== undefined) updateProps.band_number = band_number;
      if (address !== undefined) updateProps.address = address;
      if (phone !== undefined) updateProps.phone = phone;
      if (fax !== undefined) updateProps.fax = fax;
      if (latitude !== undefined && latitude !== null) updateProps.latitude = parseFloat(latitude);
      if (longitude !== undefined && longitude !== null) updateProps.longitude = parseFloat(longitude);
      
      const setClause = Object.keys(updateProps).filter(k => k !== 'id').map(k => `c.${k} = $${k}`).join(', ');
      const result = await session.run(
        `MATCH (c:Community {id: $id}) SET ${setClause} RETURN c`,
        updateProps
      );
      
      if (result.records.length === 0) {
        await session.close();
        await auditLogger.log(req, {
          action: 'community.update',
          resourceType: 'community',
          resourceId: id,
          success: false,
          message: 'Community not found'
        });
        return res.status(404).json({ error: 'Community not found' });
      }
      
      await auditLogger.log(req, {
        action: 'community.update',
        resourceType: 'community',
        resourceId: id,
        success: true,
        details: { name }
      });
      await session.close();
      return res.json({ success: true, community: result.records[0].get('c').properties });
    }
    
    // Create new community
    // Check for duplicate by name
    const exists = await session.run('MATCH (c:Community {name: $name}) RETURN c', { name });
    if (exists.records.length) {
      await session.close();
      await auditLogger.log(req, {
        action: 'community.create',
        resourceType: 'community',
        resourceId: null,
        success: false,
        message: 'Community with this name already exists'
      });
      return res.status(400).json({ error: 'Community with this name already exists' });
    }
    
    const communityId = `COMM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const props = {
      id: communityId,
      name,
      band_number: band_number || null,
      address: address || null,
      phone: phone || null,
      fax: fax || null,
      latitude: latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
      longitude: longitude !== undefined && longitude !== null ? parseFloat(longitude) : null
    };
    
    const result = await session.run(
      `CREATE (c:Community $props) RETURN c`,
      { props }
    );
    
    await auditLogger.log(req, {
      action: 'community.create',
      resourceType: 'community',
      resourceId: communityId,
      success: true,
      details: { name }
    });
    await session.close();
    res.json({ success: true, community: result.records[0].get('c').properties });
  } catch (err) {
    console.error('Error in POST /api/communities:', err);
    await auditLogger.log(req, {
      action: 'community.create',
      resourceType: 'community',
      resourceId: null,
      success: false,
      message: 'Failed to create/update community',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to create/update community', details: err.message });
  } finally {
    if (session) await session.close();
  }
}

/**
 * Delete a community
 */
async function deleteCommunity(req, res, driver, auditLogger, database) {
  const { id, name } = req.body;
  console.log('DELETE /api/communities called with:', req.body);
  if (!id && !name) {
    await auditLogger.log(req, {
      action: 'community.delete',
      resourceType: 'community',
      resourceId: null,
      success: false,
      message: 'ID or Name is required'
    });
    return res.status(400).json({ error: 'ID or Name is required' });
  }
  let session = driver.session({ database });
  try {
    const matchClause = id ? 'MATCH (c:Community {id: $id})' : 'MATCH (c:Community {name: $name})';
    const params = id ? { id } : { name };
    
    // Check if community is referenced by any LovedOne or Applicant
    const checkRefs = await session.run(
      `${matchClause} OPTIONAL MATCH (c)<-[:BELONGS_TO|:FROM]-(n) RETURN count(n) as refCount`,
      params
    );
    const refCount = checkRefs.records[0]?.get('refCount')?.toNumber() || 0;
    
    if (refCount > 0) {
      await session.close();
      await auditLogger.log(req, {
        action: 'community.delete',
        resourceType: 'community',
        resourceId: id || name,
        success: false,
        message: `Cannot delete community: it is referenced by ${refCount} record(s)`
      });
      return res.status(400).json({ error: `Cannot delete community: it is referenced by ${refCount} record(s)` });
    }
    
    const result = await session.run(
      `${matchClause} DELETE c RETURN c`,
      params
    );
    
    if (result.records.length === 0) {
      await auditLogger.log(req, {
        action: 'community.delete',
        resourceType: 'community',
        resourceId: id || name,
        success: true
      });
      res.json({ success: true });
    } else {
      await auditLogger.log(req, {
        action: 'community.delete',
        resourceType: 'community',
        resourceId: id || name,
        success: false,
        message: 'Community not found'
      });
      res.status(404).json({ error: 'Community not found' });
    }
    await session.close();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting community:', err);
    await auditLogger.log(req, {
      action: 'community.delete',
      resourceType: 'community',
      resourceId: id || name,
      success: false,
      message: 'Failed to delete community',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to delete community', details: err.message });
  } finally {
    await session.close();
  }
}

module.exports = {
  getCommunities,
  createOrUpdateCommunity,
  deleteCommunity
};

