/**
 * LovedOne Controller
 * Handles all LovedOne-related operations
 */

/**
 * Get loved ones with coordinates (admin and case_worker only)
 */
async function getLovedOnesWithCoordinates(req, res, driver, auditLogger) {
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAllowed = roles.includes('admin') || roles.includes('case_worker');
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (l:LovedOne)<-[rel:RELATED_TO]-(a:Applicant)
       WHERE l.lastLocationLat IS NOT NULL AND l.lastLocationLon IS NOT NULL
       RETURN l, a, rel.relationship AS relationship
       ORDER BY coalesce(l.dateOfIncident, ''), l.name`
    );
    const results = result.records.map(r => ({
      lovedOne: r.get('l').properties,
      applicant: r.get('a').properties,
      relationship: r.get('relationship') || ''
    }));
    res.json({ results });
  } catch (err) {
    console.error('Failed to fetch loved ones with coordinates:', err);
    res.status(500).json({ error: 'Failed to fetch loved ones with coordinates' });
  } finally {
    await session.close();
  }
}

/**
 * Get loved ones by community (admin and case_worker only)
 * Supports ?expand=true for comprehensive data
 */
async function getLovedOnesByCommunity(req, res, driver, auditLogger) {
  const { community, expand } = req.query;
  if (!community || !community.trim()) {
    return res.status(400).json({ error: 'community is required' });
  }
  const roles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const isAllowed = Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'));
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  
  const includeAll = expand === 'true' || expand === '1';
  const session = driver.session();
  try {
    if (includeAll) {
      // Get loved ones with all applicant data
      const result = await session.run(
        `MATCH (l:LovedOne {community: $community})<-[rel:RELATED_TO]-(a:Applicant)
         OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
         OPTIONAL MATCH (a)-[:LOCATED_IN]->(comm:Community)
         OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
         RETURN l, a, rel.relationship AS relationship, o, comm, collect(DISTINCT u.email) AS assignedTo
         ORDER BY l.name`,
        { community }
      );
      const results = result.records.map(r => ({
        lovedOne: r.get('l').properties,
        applicant: r.get('a').properties,
        relationship: r.get('relationship') || '',
        referringOrg: r.get('o') ? r.get('o').properties : null,
        community: r.get('comm') ? r.get('comm').properties : null,
        assignedTo: r.get('assignedTo').filter(e => !!e)
      }));
      res.json({ results });
    } else {
      // Original behavior
      const result = await session.run(
        `MATCH (l:LovedOne {community: $community})<-[rel:RELATED_TO]-(a:Applicant)
         RETURN l, a, rel.relationship AS relationship ORDER BY l.name`,
        { community }
      );
      const results = result.records.map(r => ({
        lovedOne: r.get('l').properties,
        applicant: r.get('a').properties,
        relationship: r.get('relationship') || ''
      }));
      res.json({ results });
    }
  } catch (err) {
    console.error('Failed to search loved ones:', err);
    res.status(500).json({ error: 'Failed to search loved ones' });
  } finally {
    await session.close();
  }
}

/**
 * Get loved ones by date range (admin and case_worker only)
 */
async function getLovedOnesByDate(req, res, driver, auditLogger) {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });
  }
  const roles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const isAllowed = Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'));
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  
  const session = driver.session();
  try {
    // dateOfIncident stored as ISO date string; string range compare is valid
    const result = await session.run(
      `MATCH (l:LovedOne)<-[rel:RELATED_TO]-(a:Applicant)
       WHERE l.dateOfIncident >= $start AND l.dateOfIncident <= $end
       RETURN l, a, rel.relationship AS relationship
       ORDER BY l.dateOfIncident, l.name`,
      { start, end }
    );
    const results = result.records.map(r => ({
      lovedOne: r.get('l').properties,
      applicant: r.get('a').properties,
      relationship: r.get('relationship') || ''
    }));
    res.json({ results });
  } catch (err) {
    console.error('Failed to search loved ones by date:', err);
    res.status(500).json({ error: 'Failed to search loved ones by date' });
  } finally {
    await session.close();
  }
}

/**
 * Get loved ones by province (admin and case_worker only)
 * Supports province code (e.g., 'AB', 'BC') or full name (e.g., 'Alberta', 'British Columbia')
 */
async function getLovedOnesByProvince(req, res, driver, auditLogger) {
  const { province } = req.query;
  if (!province || !province.trim()) {
    return res.status(400).json({ error: 'province is required (e.g., "AB", "Alberta", "BC", "British Columbia")' });
  }
  const roles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const isAllowed = Array.isArray(roles) && (roles.includes('admin') || roles.includes('case_worker'));
  if (!isAllowed) return res.status(403).json({ error: 'Forbidden: insufficient role' });
  
  // Map province names to codes for flexible querying
  const provinceMap = {
    'alberta': 'AB',
    'british columbia': 'BC',
    'manitoba': 'MB',
    'new brunswick': 'NB',
    'newfoundland and labrador': 'NL',
    'northwest territories': 'NT',
    'nova scotia': 'NS',
    'nunavut': 'NU',
    'ontario': 'ON',
    'prince edward island': 'PE',
    'quebec': 'QC',
    'saskatchewan': 'SK',
    'yukon': 'YT'
  };
  
  const provinceLower = province.trim().toLowerCase();
  const provinceCode = provinceMap[provinceLower] || province.trim().toUpperCase();
  
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (l:LovedOne)<-[rel:RELATED_TO]-(a:Applicant)
       WHERE l.province = $provinceCode
       RETURN l, a, rel.relationship AS relationship
       ORDER BY l.name`,
      { provinceCode }
    );
    const results = result.records.map(r => ({
      lovedOne: r.get('l').properties,
      applicant: r.get('a').properties,
      relationship: r.get('relationship') || ''
    }));
    res.json({ results });
  } catch (err) {
    console.error('Failed to search loved ones by province:', err);
    res.status(500).json({ error: 'Failed to search loved ones by province', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Update loved one (admin or assigned case_worker)
 */
async function updateLovedOne(req, res, driver, auditLogger) {
  const { id } = req.params;
  const {
    applicantId,
    name,
    dateOfIncident,
    lastLocation,
    community,
    relationship,
    status,
    lastLocationLat,
    lastLocationLon,
    policeInvestigationNumber,
    investigation,
    otherInvestigation,
    supportSelections,
    support,
    otherSupport,
    additionalNotes
  } = req.body || {};
  
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAdmin = roles.includes('admin');
  const isCaseWorker = roles.includes('case_worker');
  
  const session = driver.session();
  try {
    if (!isAdmin) {
      // For non-admin, require applicantId and ensure user is assigned to that case
      if (!applicantId || !isCaseWorker) {
        await auditLogger.log(req, {
          action: 'loved_one.update',
          resourceType: 'loved_one',
          resourceId: id,
          success: false,
          message: 'Forbidden: insufficient role or missing applicantId'
        });
        await session.close();
        return res.status(403).json({ error: 'Forbidden' });
      }
      const check = await session.run(
        'MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a',
        { caseId: applicantId, email: req.user.email || req.user.preferred_username }
      );
      if (check.records.length === 0) {
        await auditLogger.log(req, {
          action: 'loved_one.update',
          resourceType: 'loved_one',
          resourceId: id,
          success: false,
          message: 'Forbidden: not assigned to applicant',
          details: { applicantId }
        });
        await session.close();
        return res.status(403).json({ error: 'Not authorized' });
      }
    }
    
    const investigationProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'investigation');
    const otherInvestigationProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'otherInvestigation');
    const supportProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'supportSelections') || Object.prototype.hasOwnProperty.call(req.body || {}, 'support');
    const otherSupportProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'otherSupport');
    const notesProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'additionalNotes');
    const investigationList = investigationProvided ? (Array.isArray(investigation) ? investigation : []) : null;
    const supportList = supportProvided ? (Array.isArray(supportSelections) ? supportSelections : (Array.isArray(support) ? support : [])) : null;
    const otherInvestigationValue = otherInvestigationProvided ? (otherInvestigation || '') : null;
    const otherSupportValue = otherSupportProvided ? (otherSupport || '') : null;
    const notesValue = notesProvided ? (additionalNotes || '') : null;
    
    await session.run(
      `MATCH (l:LovedOne {id: $id})
       SET l.name = coalesce($name, l.name),
           l.dateOfIncident = coalesce($dateOfIncident, l.dateOfIncident),
           l.lastLocation = coalesce($lastLocation, l.lastLocation),
           l.community = coalesce($community, l.community),
           l.status = coalesce($status, l.status),
           l.lastLocationLat = coalesce($lastLocationLat, l.lastLocationLat),
           l.lastLocationLon = coalesce($lastLocationLon, l.lastLocationLon),
           l.policeInvestigationNumber = coalesce($policeInvestigationNumber, l.policeInvestigationNumber),
           l.investigation = coalesce($investigation, l.investigation),
           l.otherInvestigation = coalesce($otherInvestigation, l.otherInvestigation),
           l.supportSelections = coalesce($supportSelections, l.supportSelections),
           l.otherSupport = coalesce($otherSupport, l.otherSupport),
           l.additionalNotes = coalesce($additionalNotes, l.additionalNotes)`,
      {
        id,
        name,
        dateOfIncident,
        lastLocation,
        community,
        status,
        lastLocationLat: (lastLocationLat !== undefined && lastLocationLat !== '' ? parseFloat(lastLocationLat) : null),
        lastLocationLon: (lastLocationLon !== undefined && lastLocationLon !== '' ? parseFloat(lastLocationLon) : null),
        policeInvestigationNumber,
        investigation: investigationList,
        otherInvestigation: otherInvestigationValue,
        supportSelections: supportList,
        otherSupport: otherSupportValue,
        additionalNotes: notesValue
      }
    );
    
    // Update relationship if provided and applicantId is provided
    if (relationship != null && applicantId) {
      await session.run(
        `MATCH (a:Applicant {id: $applicantId})-[rel:RELATED_TO]->(l:LovedOne {id: $id})
         SET rel.relationship = $relationship`,
        { applicantId, id, relationship }
      );
    }
    
    // Return updated node
    const resNode = await session.run('MATCH (l:LovedOne {id: $id}) RETURN l', { id });
    const lovedOne = resNode.records[0] ? resNode.records[0].get('l').properties : null;
    await session.close();
    
    await auditLogger.log(req, {
      action: 'loved_one.update',
      resourceType: 'loved_one',
      resourceId: id,
      success: true,
      details: { applicantId: applicantId || null, updatedFields: Object.keys(req.body || {}) }
    });
    
    return res.json({ success: true, lovedOne });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'loved_one.update',
      resourceType: 'loved_one',
      resourceId: id,
      success: false,
      message: 'Failed to update Loved One',
      details: { error: err.message }
    });
    console.error('Failed to update loved one:', err);
    res.status(500).json({ error: 'Failed to update loved one', details: err.message });
  }
}

module.exports = {
  getLovedOnesWithCoordinates,
  getLovedOnesByCommunity,
  getLovedOnesByDate,
  getLovedOnesByProvince,
  updateLovedOne
};

