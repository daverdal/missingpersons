/**
 * Organization Controller
 * Handles business logic for organizations and their contacts
 */

/**
 * Get all organizations
 */
async function getOrganizations(req, res, driver, auditLogger) {
  console.log('GET /api/organizations called');
  const session = driver.session();
  try {
    const result = await session.run('MATCH (o:Organization) WHERE o.active IS NULL OR o.active = true RETURN o ORDER BY o.name');
    const organizations = result.records.map(r => r.get('o').properties);
    console.log('Organizations returned:', organizations.length);
    await session.close();
    res.json({ organizations });
  } catch (err) {
    console.error('Error fetching organizations:', err);
    await session.close();
    res.status(500).json({ error: 'Failed to fetch organizations', details: err.message });
  }
}

/**
 * Create or update an organization
 */
async function createOrUpdateOrganization(req, res, driver, auditLogger) {
  const { name, contact, phone, id } = req.body;
  console.log('POST /api/organizations called with:', req.body);
  if (!name) {
    console.log('Organization creation failed: Name is required');
    await auditLogger.log(req, {
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: null,
      success: false,
      message: 'Name is required'
    });
    return res.status(400).json({ error: 'Name is required' });
  }
  const session = driver.session();
  try {
    // If id is provided, update existing organization
    if (id) {
      const result = await session.run(
        'MATCH (o:Organization {id: $id}) SET o.name = $name, o.contact = $contact, o.phone = $phone RETURN o',
        { id, name, contact: contact || null, phone: phone || null }
      );
      
      if (result.records.length === 0) {
        await session.close();
        await auditLogger.log(req, {
          action: 'organization.update',
          resourceType: 'organization',
          resourceId: id,
          success: false,
          message: 'Organization not found'
        });
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      await auditLogger.log(req, {
        action: 'organization.update',
        resourceType: 'organization',
        resourceId: id,
        success: true,
        details: { name }
      });
      await session.close();
      return res.json({ success: true, organization: result.records[0].get('o').properties });
    }
    
    // Check for duplicate (active or inactive)
    const exists = await session.run('MATCH (o:Organization {name: $name}) RETURN o', { name });
    if (exists.records.length) {
      // If org exists and is inactive, reactivate and update info
      const org = exists.records[0].get('o').properties;
      if (org.active === false) {
        await session.run('MATCH (o:Organization {name: $name}) SET o.active = true, o.contact = $contact, o.phone = $phone', { name, contact, phone });
        console.log('Organization reactivated:', name, contact, phone);
        await session.close();
        await auditLogger.log(req, {
          action: 'organization.reactivate',
          resourceType: 'organization',
          resourceId: name,
          success: true
        });
        return res.json({ success: true, reactivated: true });
      }
      console.log('Organization creation failed: Duplicate name');
      await session.close();
      await auditLogger.log(req, {
        action: 'organization.create',
        resourceType: 'organization',
        resourceId: name,
        success: false,
        message: 'Organization already exists'
      });
      return res.status(409).json({ error: 'Organization already exists' });
    }
    
    // Create new organization with id
    const orgId = `ORG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await session.run('CREATE (o:Organization {id: $id, name: $name, contact: $contact, phone: $phone, active: true})', { id: orgId, name, contact, phone });
    console.log('Organization created:', name, contact, phone);
    await session.close();
    await auditLogger.log(req, {
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: orgId,
      success: true
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error creating organization:', err);
    await session.close();
    await auditLogger.log(req, {
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: name,
      success: false,
      message: 'Failed to create organization',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to create organization', details: err.message });
  }
}

/**
 * Delete (deactivate) an organization
 */
async function deleteOrganization(req, res, driver, auditLogger) {
  const { name } = req.body;
  console.log('DELETE /api/organizations called with:', req.body);
  if (!name) {
    await auditLogger.log(req, {
      action: 'organization.deactivate',
      resourceType: 'organization',
      resourceId: null,
      success: false,
      message: 'Name is required'
    });
    return res.status(400).json({ error: 'Name is required' });
  }
  const session = driver.session();
  try {
    // Log all org names for debugging
    const allOrgs = await session.run('MATCH (o:Organization) RETURN o.name');
    console.log('Existing organizations:', allOrgs.records.map(r => r.get('o.name')));
    // Set active to false instead of deleting
    const result = await session.run('MATCH (o:Organization {name: $name}) SET o.active = false RETURN o', { name });
    if (result.summary.counters.updates().propertiesSet > 0) {
      console.log('Organization soft-deleted:', name);
      await auditLogger.log(req, {
        action: 'organization.deactivate',
        resourceType: 'organization',
        resourceId: name,
        success: true
      });
      res.json({ success: true });
    } else {
      console.log('Organization not found for delete:', name);
      await auditLogger.log(req, {
        action: 'organization.deactivate',
        resourceType: 'organization',
        resourceId: name,
        success: false,
        message: 'Organization not found'
      });
      res.status(404).json({ error: 'Organization not found' });
    }
  } catch (err) {
    console.error('Error in DELETE /api/organizations:', err);
    await auditLogger.log(req, {
      action: 'organization.deactivate',
      resourceType: 'organization',
      resourceId: name,
      success: false,
      message: 'Failed to deactivate organization',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to deactivate organization', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get all contacts for an organization
 */
async function getOrganizationContacts(req, res, driver, auditLogger) {
  const { orgId } = req.params;
  const session = driver.session();
  try {
    const result = await session.run(
      'MATCH (o:Organization {id: $orgId})-[:HAS_CONTACT]->(c:Contact) RETURN c ORDER BY c.name',
      { orgId }
    );
    const contacts = result.records.map(r => r.get('c').properties);
    await session.close();
    res.json({ contacts });
  } catch (err) {
    console.error('Error fetching contacts:', err);
    await session.close();
    res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
  }
}

/**
 * Create or update a contact for an organization
 */
async function createOrUpdateContact(req, res, driver, auditLogger) {
  const { orgId } = req.params;
  const { name, phone, email, id } = req.body;
  console.log('POST /api/organizations/:orgId/contacts called with:', { orgId, name, phone, email, id });
  
  if (!name) {
    await auditLogger.log(req, {
      action: 'organization.contact.create',
      resourceType: 'contact',
      resourceId: null,
      success: false,
      message: 'Contact name is required'
    });
    return res.status(400).json({ error: 'Contact name is required' });
  }
  
  const session = driver.session();
  try {
    // Verify organization exists
    const orgCheck = await session.run('MATCH (o:Organization {id: $orgId}) RETURN o', { orgId });
    if (orgCheck.records.length === 0) {
      await session.close();
      await auditLogger.log(req, {
        action: 'organization.contact.create',
        resourceType: 'contact',
        resourceId: null,
        success: false,
        message: 'Organization not found'
      });
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // If id is provided, update existing contact
    if (id) {
      const result = await session.run(
        `MATCH (o:Organization {id: $orgId})-[:HAS_CONTACT]->(c:Contact {id: $id})
         SET c.name = $name, c.phone = $phone, c.email = $email
         RETURN c`,
        { orgId, id, name, phone: phone || null, email: email || null }
      );
      
      if (result.records.length === 0) {
        await session.close();
        await auditLogger.log(req, {
          action: 'organization.contact.update',
          resourceType: 'contact',
          resourceId: id,
          success: false,
          message: 'Contact not found'
        });
        return res.status(404).json({ error: 'Contact not found' });
      }
      
      await auditLogger.log(req, {
        action: 'organization.contact.update',
        resourceType: 'contact',
        resourceId: id,
        success: true,
        details: { name, organizationId: orgId }
      });
      await session.close();
      return res.json({ success: true, contact: result.records[0].get('c').properties });
    }
    
    // Create new contact
    const contactId = `CONTACT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await session.run(
      `MATCH (o:Organization {id: $orgId})
       CREATE (c:Contact {id: $contactId, name: $name, phone: $phone, email: $email})
       CREATE (o)-[:HAS_CONTACT]->(c)
       RETURN c`,
      { orgId, contactId, name, phone: phone || null, email: email || null }
    );
    
    await auditLogger.log(req, {
      action: 'organization.contact.create',
      resourceType: 'contact',
      resourceId: contactId,
      success: true,
      details: { name, organizationId: orgId }
    });
    await session.close();
    res.json({ success: true, contact: result.records[0].get('c').properties });
  } catch (err) {
    console.error('Error creating/updating contact:', err);
    await session.close();
    await auditLogger.log(req, {
      action: 'organization.contact.create',
      resourceType: 'contact',
      resourceId: null,
      success: false,
      message: 'Failed to create/update contact',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to create/update contact', details: err.message });
  }
}

/**
 * Delete a contact from an organization
 */
async function deleteContact(req, res, driver, auditLogger) {
  const { orgId, contactId } = req.params;
  console.log('DELETE /api/organizations/:orgId/contacts/:contactId called with:', { orgId, contactId });
  
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (o:Organization {id: $orgId})-[:HAS_CONTACT]->(c:Contact {id: $contactId})
       DETACH DELETE c
       RETURN c`,
      { orgId, contactId }
    );
    
    // Check if contact was found and deleted
    // If result.records.length === 0, the contact didn't exist
    if (result.records.length === 0) {
      await session.close();
      await auditLogger.log(req, {
        action: 'organization.contact.delete',
        resourceType: 'contact',
        resourceId: contactId,
        success: false,
        message: 'Contact not found'
      });
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    await auditLogger.log(req, {
      action: 'organization.contact.delete',
      resourceType: 'contact',
      resourceId: contactId,
      success: true,
      details: { organizationId: orgId }
    });
    await session.close();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting contact:', err);
    await session.close();
    await auditLogger.log(req, {
      action: 'organization.contact.delete',
      resourceType: 'contact',
      resourceId: contactId,
      success: false,
      message: 'Failed to delete contact',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to delete contact', details: err.message });
  }
}

module.exports = {
  getOrganizations,
  createOrUpdateOrganization,
  deleteOrganization,
  getOrganizationContacts,
  createOrUpdateContact,
  deleteContact
};

