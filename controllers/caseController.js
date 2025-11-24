/**
 * Case/Applicant Controller
 * Handles all case and applicant-related operations
 */

/**
 * Get all cases/applicants
 */
async function getAllCases(req, res, driver, auditLogger) {
  const expand = req.query.expand === 'true' || req.query.expand === '1';
  const session = driver.session();
  try {
    if (expand) {
      // Get all applicants with all related data
      const result = await session.run(`
        MATCH (a:Applicant)
        OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
        OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
        OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
        OPTIONAL MATCH (a)-[:LOCATED_IN]->(comm:Community)
        RETURN a, o, 
               collect(DISTINCT {lovedOne: l, relationship: rel.relationship}) AS lovedOnes,
               collect(DISTINCT u.email) AS assignedTo,
               comm
      `);
      const cases = result.records.map(r => {
        const a = r.get('a').properties;
        const orgNode = r.get('o');
        const lovedOnesRaw = r.get('lovedOnes');
        const lovedOnes = lovedOnesRaw
          .filter(lo => lo && lo.lovedOne)
          .map(lo => ({
            ...lo.lovedOne.properties,
            relationship: lo.relationship || ''
          }));
        const commNode = r.get('comm');
        return {
          ...a,
          referringOrg: orgNode ? orgNode.properties : null,
          lovedOnes,
          assignedTo: r.get('assignedTo').filter(e => !!e),
          community: commNode ? commNode.properties : null
        };
      });
      res.json({ cases });
    } else {
      // Original behavior: Get all applicants and who they are assigned to
      const result = await session.run(`
        MATCH (a:Applicant)
        OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
        RETURN a, collect(u.email) AS assignedTo
      `);
      const cases = result.records.map(r => {
        const a = r.get('a').properties;
        a.assignedTo = r.get('assignedTo').filter(e => !!e);
        return a;
      });
      res.json({ cases });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cases' });
  } finally {
    await session.close();
  }
}

/**
 * Search applicants by name
 */
async function searchApplicants(req, res, driver, auditLogger) {
  const { name, expand } = req.query;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name query parameter is required' });
  }
  
  const includeAll = expand === 'true' || expand === '1';
  const session = driver.session();
  try {
    if (includeAll) {
      // Search with all related data
      const result = await session.run(
        `MATCH (a:Applicant)
         WHERE toLower(a.name) CONTAINS toLower($name)
         OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
         OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
         OPTIONAL MATCH (a)-[:LOCATED_IN]->(comm:Community)
         OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
         RETURN a, o, 
                collect(DISTINCT {lovedOne: l, relationship: rel.relationship}) AS lovedOnes,
                comm,
                collect(DISTINCT u.email) AS assignedTo
         ORDER BY a.name
         LIMIT 50`,
        { name: name.trim() }
      );
      
      const applicants = result.records.map(r => {
        const applicant = r.get('a').properties;
        const orgNode = r.get('o');
        const referringOrg = orgNode ? orgNode.properties : null;
        const lovedOnesRaw = r.get('lovedOnes');
        const lovedOnes = lovedOnesRaw
          .filter(lo => lo && lo.lovedOne)
          .map(lo => ({
            ...lo.lovedOne.properties,
            relationship: lo.relationship || ''
          }));
        const commNode = r.get('comm');
        return {
          applicant,
          referringOrg,
          lovedOnes,
          community: commNode ? commNode.properties : null,
          assignedTo: r.get('assignedTo').filter(e => !!e)
        };
      });
      
      await session.close();
      res.json({ applicants, count: applicants.length });
    } else {
      // Original behavior: Search for applicants by name (case-insensitive, partial match)
      const result = await session.run(
        `MATCH (a:Applicant)
         WHERE toLower(a.name) CONTAINS toLower($name)
         OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
         OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
         RETURN a, o, collect({lovedOne: l, relationship: rel.relationship}) AS lovedOnes
         ORDER BY a.name
         LIMIT 50`,
        { name: name.trim() }
      );
      
      const applicants = result.records.map(r => {
        const applicant = r.get('a').properties;
        const orgNode = r.get('o');
        const referringOrg = orgNode ? orgNode.properties : null;
        const lovedOnesRaw = r.get('lovedOnes');
        const lovedOnes = lovedOnesRaw
          .filter(lo => lo.lovedOne)
          .map(lo => ({
            ...lo.lovedOne.properties,
            relationship: lo.relationship || ''
          }));
        return { applicant, referringOrg, lovedOnes };
      });
      
      await session.close();
      res.json({ applicants, count: applicants.length });
    }
  } catch (err) {
    await session.close();
    console.error('Error searching applicants:', err);
    res.status(500).json({ error: 'Failed to search applicants', details: err.message });
  }
}

/**
 * Get applicant by ID
 */
async function getApplicantById(req, res, driver, auditLogger) {
  const { id } = req.params;
  const includeAll = req.query.includeAll === 'true' || req.query.includeAll === '1';
  
  try {
    const session = driver.session();
    
    if (includeAll) {
      // Get applicant with ALL related data: org, lovedOnes, notes, files, events, community, assigned users
      const result = await session.run(
        `MATCH (a:Applicant {id: $id})
         OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
         OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
         OPTIONAL MATCH (a)-[:HAS_NOTE]->(n:Note)
         OPTIONAL MATCH (a)-[:HAS_FILE]->(f:File)
         OPTIONAL MATCH (a)-[:HAS_EVENT]->(e:CaseEvent)
         OPTIONAL MATCH (a)-[:LOCATED_IN]->(comm:Community)
         OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
         RETURN a, o, 
                collect(DISTINCT {lovedOne: l, relationship: rel.relationship}) AS lovedOnes,
                collect(DISTINCT n) AS notes,
                collect(DISTINCT f) AS files,
                collect(DISTINCT e) AS events,
                comm,
                collect(DISTINCT u) AS assignedUsers`,
        { id }
      );
      await session.close();
      
      if (!result.records.length) return res.status(404).json({ error: 'Not found' });
      
      const record = result.records[0];
      const applicant = record.get('a').properties;
      const orgNode = record.get('o');
      const referringOrg = orgNode ? orgNode.properties : null;
      
      // Process lovedOnes
      const lovedOnesRaw = record.get('lovedOnes');
      const lovedOnes = lovedOnesRaw
        .filter(lo => lo && lo.lovedOne)
        .map(lo => ({
          ...lo.lovedOne.properties,
          relationship: lo.relationship || ''
        }));
      
      // Process notes
      const notesRaw = record.get('notes');
      const notes = notesRaw
        .filter(n => n !== null)
        .map(n => n.properties);
      
      // Process files
      const filesRaw = record.get('files');
      const files = filesRaw
        .filter(f => f !== null)
        .map(f => f.properties);
      
      // Process events
      const eventsRaw = record.get('events');
      const events = eventsRaw
        .filter(e => e !== null)
        .map(e => e.properties);
      
      // Process community
      const commNode = record.get('comm');
      const community = commNode ? commNode.properties : null;
      
      // Process assigned users
      const usersRaw = record.get('assignedUsers');
      const assignedUsers = usersRaw
        .filter(u => u !== null)
        .map(u => ({
          id: u.properties.id,
          name: u.properties.name,
          email: u.properties.email,
          roles: u.properties.roles
        }));
      
      res.json({
        applicant,
        referringOrg,
        lovedOnes,
        notes,
        files,
        events,
        community,
        assignedUsers
      });
    } else {
      // Original behavior: Get applicant, referring org, and related LovedOne(s)
      const result = await session.run(
        `MATCH (a:Applicant {id: $id})
         OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
         OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
         RETURN a, o, collect({lovedOne: l, relationship: rel.relationship}) AS lovedOnes`,
        { id }
      );
      await session.close();
      if (!result.records.length) return res.status(404).json({ error: 'Not found' });
      const applicant = result.records[0].get('a').properties;
      const orgNode = result.records[0].get('o');
      const referringOrg = orgNode ? orgNode.properties : null;
      // lovedOnes is an array of {lovedOne, relationship}
      const lovedOnesRaw = result.records[0].get('lovedOnes');
      const lovedOnes = lovedOnesRaw
        .filter(lo => lo.lovedOne)
        .map(lo => ({
          ...lo.lovedOne.properties,
          relationship: lo.relationship || ''
        }));
      res.json({ applicant, referringOrg, lovedOnes });
    }
  } catch (err) {
    console.error('Error fetching applicant:', err);
    res.status(500).json({ error: 'Failed to fetch applicant', details: err.message });
  }
}

/**
 * Get applicant with ALL related data (comprehensive endpoint)
 */
async function getApplicantComplete(req, res, driver, auditLogger) {
  const { id } = req.params;
  try {
    const session = driver.session();
    // Get applicant with ALL related data: org, lovedOnes, notes, files, events, community, assigned users
    const result = await session.run(
      `MATCH (a:Applicant {id: $id})
       OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
       OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
       OPTIONAL MATCH (a)-[:HAS_NOTE]->(n:Note)
       OPTIONAL MATCH (a)-[:HAS_FILE]->(f:File)
       OPTIONAL MATCH (a)-[:HAS_EVENT]->(e:CaseEvent)
       OPTIONAL MATCH (a)-[:LOCATED_IN]->(comm:Community)
       OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
       RETURN a, o, 
              collect(DISTINCT {lovedOne: l, relationship: rel.relationship}) AS lovedOnes,
              collect(DISTINCT n) AS notes,
              collect(DISTINCT f) AS files,
              collect(DISTINCT e) AS events,
              comm,
              collect(DISTINCT u) AS assignedUsers`,
      { id }
    );
    await session.close();
    
    if (!result.records.length) return res.status(404).json({ error: 'Not found' });
    
    const record = result.records[0];
    const applicant = record.get('a').properties;
    const orgNode = record.get('o');
    const referringOrg = orgNode ? orgNode.properties : null;
    
    // Process lovedOnes
    const lovedOnesRaw = record.get('lovedOnes');
    const lovedOnes = lovedOnesRaw
      .filter(lo => lo && lo.lovedOne)
      .map(lo => ({
        ...lo.lovedOne.properties,
        relationship: lo.relationship || ''
      }));
    
    // Process notes
    const notesRaw = record.get('notes');
    const notes = notesRaw
      .filter(n => n !== null)
      .map(n => n.properties);
    
    // Process files
    const filesRaw = record.get('files');
    const files = filesRaw
      .filter(f => f !== null)
      .map(f => f.properties);
    
    // Process events
    const eventsRaw = record.get('events');
    const events = eventsRaw
      .filter(e => e !== null)
      .map(e => e.properties);
    
    // Process community
    const commNode = record.get('comm');
    const community = commNode ? commNode.properties : null;
    
    // Process assigned users
    const usersRaw = record.get('assignedUsers');
    const assignedUsers = usersRaw
      .filter(u => u !== null)
      .map(u => ({
        id: u.properties.id,
        name: u.properties.name,
        email: u.properties.email,
        roles: u.properties.roles
      }));
    
    res.json({
      applicant,
      referringOrg,
      lovedOnes,
      notes,
      files,
      events,
      community,
      assignedUsers
    });
  } catch (err) {
    console.error('Error fetching applicant with all details:', err);
    res.status(500).json({ error: 'Failed to fetch applicant', details: err.message });
  }
}

/**
 * Get cases assigned to current user
 */
async function getMyCases(req, res, driver, auditLogger) {
  const userEmail = req.user && (req.user.email || req.user.preferred_username);
  if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });
  const expand = req.query.expand === 'true' || req.query.expand === '1';
  const session = driver.session();
  try {
    if (expand) {
      // Find applicants assigned to this user with all related data
      const result = await session.run(
        `MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant)
         OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
         OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
         OPTIONAL MATCH (a)-[:LOCATED_IN]->(comm:Community)
         RETURN a, o, 
                collect(DISTINCT {lovedOne: l, relationship: rel.relationship}) AS lovedOnes,
                comm`,
        { email: userEmail }
      );
      const cases = result.records.map(r => {
        const a = r.get('a').properties;
        const orgNode = r.get('o');
        const lovedOnesRaw = r.get('lovedOnes');
        const lovedOnes = lovedOnesRaw
          .filter(lo => lo && lo.lovedOne)
          .map(lo => ({
            ...lo.lovedOne.properties,
            relationship: lo.relationship || ''
          }));
        const commNode = r.get('comm');
        return {
          ...a,
          referringOrg: orgNode ? orgNode.properties : null,
          lovedOnes,
          community: commNode ? commNode.properties : null
        };
      });
      res.json({ cases });
    } else {
      // Original behavior: Find applicants assigned to this user
      const result = await session.run(
        'MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant) RETURN a',
        { email: userEmail }
      );
      const cases = result.records.map(r => r.get('a').properties);
      res.json({ cases });
    }
  } catch (err) {
    console.error('Failed to fetch my cases:', err);
    res.status(500).json({ error: 'Failed to fetch cases' });
  } finally {
    await session.close();
  }
}

/**
 * Get cases assigned to a specific case worker
 */
async function getCaseWorkerCases(req, res, driver, auditLogger) {
  const { email } = req.params;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant) RETURN a`,
      { email }
    );
    const cases = result.records.map(r => r.get('a').properties);
    res.json({ cases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assigned cases' });
  } finally {
    await session.close();
  }
}

/**
 * Get applicants with phone numbers (admin only)
 */
async function getApplicantsWithPhoneNumbers(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.contact IS NOT NULL AND a.contact <> '' AND a.smsOptIn = true
       RETURN a.id AS id, a.name AS name, a.contact AS contact, a.email AS email, a.smsOptIn AS smsOptIn
       ORDER BY a.name`
    );
    const applicants = result.records.map(r => {
      const id = r.get('id');
      const name = r.get('name');
      const contact = r.get('contact');
      const email = r.get('email');
      return {
        id: id ? String(id) : '',
        name: name ? String(name) : '',
        contact: contact ? String(contact) : '',
        email: email ? String(email) : ''
      };
    });
    res.json({ applicants });
  } catch (err) {
    console.error('Failed to fetch applicants with phone numbers:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to fetch applicants', 
      details: err.message,
      code: err.code
    });
  } finally {
    await session.close();
  }
}

/**
 * Get applicants with email addresses (admin only)
 */
async function getApplicantsWithEmailAddresses(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.email IS NOT NULL AND a.email <> '' AND a.emailOptIn = true
       RETURN a.id AS id, a.name AS name, a.email AS email, a.contact AS contact, a.emailOptIn AS emailOptIn
       ORDER BY a.name`
    );
    const applicants = result.records.map(r => {
      const id = r.get('id');
      const name = r.get('name');
      const email = r.get('email');
      const contact = r.get('contact');
      return {
        id: id ? String(id) : '',
        name: name ? String(name) : '',
        email: email ? String(email) : '',
        contact: contact ? String(contact) : ''
      };
    });
    res.json({ applicants });
  } catch (err) {
    console.error('Failed to fetch applicants with email addresses:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to fetch applicants', 
      details: err.message,
      code: err.code
    });
  } finally {
    await session.close();
  }
}

/**
 * Get applicants by province
 */
async function getApplicantsByProvince(req, res, driver, auditLogger) {
  const { province } = req.query;
  if (!province || !province.trim()) {
    return res.status(400).json({ error: 'province is required (e.g., "AB", "Alberta", "BC", "British Columbia")' });
  }
  
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
      `MATCH (a:Applicant)
       WHERE a.province = $provinceCode
       RETURN a
       ORDER BY a.name`,
      { provinceCode }
    );
    const applicants = result.records.map(r => r.get('a').properties);
    res.json({ applicants });
  } catch (err) {
    console.error('Failed to search applicants by province:', err);
    res.status(500).json({ error: 'Failed to search applicants by province', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Update applicant/case
 */
async function updateApplicant(req, res, driver, auditLogger) {
  const { id } = req.params;
  const {
    name,
    kinshipRole,
    contact,
    email,
    address,
    language,
    community,
    contactTime,
    notes,
    newsKeywords,
    referringOrganization,
    smsOptIn,
    emailOptIn,
    status
  } = req.body || {};
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAdmin = roles.includes('admin');
  const isCaseWorker = roles.includes('case_worker');
  // Normalize newsKeywords into an array of non-empty strings or null
  let newsKeywordsParam = null;
  if (Array.isArray(newsKeywords)) {
    newsKeywordsParam = newsKeywords
      .map(k => String(k).trim())
      .filter(k => k.length > 0);
    if (!newsKeywordsParam.length) newsKeywordsParam = null;
  } else if (typeof newsKeywords === 'string') {
    const trimmed = newsKeywords.trim();
    if (trimmed) {
      newsKeywordsParam = trimmed
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      if (!newsKeywordsParam.length) newsKeywordsParam = null;
    }
  }
  const session = driver.session();
  try {
    if (!isAdmin) {
      if (!isCaseWorker) {
        await auditLogger.log(req, {
          action: 'applicant.update',
          resourceType: 'applicant',
          resourceId: id,
          success: false,
          message: 'Forbidden: insufficient role'
        });
        await session.close();
        return res.status(403).json({ error: 'Forbidden' });
      }
      // Ensure this user is assigned to the case
      const check = await session.run(
        'MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a',
        { caseId: id, email: req.user.email || req.user.preferred_username }
      );
      if (check.records.length === 0) {
        await auditLogger.log(req, {
          action: 'applicant.update',
          resourceType: 'applicant',
          resourceId: id,
          success: false,
          message: 'Forbidden: not assigned to case'
        });
        await session.close();
        return res.status(403).json({ error: 'Not authorized' });
      }
    }
    // Prepare parameters (avoid undefined, use null instead so coalesce works)
    const applicantParams = {
      id,
      name: name ?? null,
      kinshipRole: kinshipRole ?? null,
      contact: contact ?? null,
      email: email ?? null,
      address: address ?? null,
      language: language ?? null,
      community: community ?? null,
      contactTime: contactTime ?? null,
      notes: notes ?? null,
      smsOptIn: smsOptIn !== undefined ? (smsOptIn === true || smsOptIn === 'true') : null,
      emailOptIn: emailOptIn !== undefined ? (emailOptIn === true || emailOptIn === 'true') : null,
      status: status ?? null
    };

    // Update core applicant fields; only set provided fields
    await session.run(
      `MATCH (a:Applicant {id: $id})
       SET a.name = coalesce($name, a.name),
           a.kinshipRole = coalesce($kinshipRole, a.kinshipRole),
           a.contact = coalesce($contact, a.contact),
           a.email = coalesce($email, a.email),
           a.address = coalesce($address, a.address),
           a.language = coalesce($language, a.language),
           a.community = coalesce($community, a.community),
           a.contactTime = coalesce($contactTime, a.contactTime),
           a.notes = coalesce($notes, a.notes),
           a.smsOptIn = coalesce($smsOptIn, a.smsOptIn),
           a.emailOptIn = coalesce($emailOptIn, a.emailOptIn),
           a.status = coalesce($status, a.status)`,
      applicantParams
    );
    // Update newsKeywords only if provided (non-null) to avoid type issues
    if (newsKeywordsParam !== null) {
      await session.run(
        `MATCH (a:Applicant {id: $id})
         SET a.newsKeywords = $newsKeywordsParam`,
        { id, newsKeywordsParam }
      );
    }
    // Update referring organization relationship if provided
    if (referringOrganization !== undefined) {
      // Remove existing relationship and create a new one if org name provided and exists
      await session.run(
        `MATCH (a:Applicant {id: $id})
         OPTIONAL MATCH (a)-[r:REFERRED_BY]->(:Organization)
         DELETE r`,
        { id }
      );
      if (referringOrganization) {
        await session.run(
          `MATCH (a:Applicant {id: $id}), (o:Organization {name: $orgName})
           MERGE (a)-[:REFERRED_BY]->(o)`,
          { id, orgName: referringOrganization }
        );
      }
    }
    // Return updated applicant with referring org
    const result = await session.run(
      `MATCH (a:Applicant {id: $id})
       OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
       RETURN a, o`,
      { id }
    );
    const aNode = result.records[0] && result.records[0].get('a');
    const oNode = result.records[0] && result.records[0].get('o');
    await session.close();
    await auditLogger.log(req, {
      action: 'applicant.update',
      resourceType: 'applicant',
      resourceId: id,
      success: true,
      details: { updatedFields: Object.keys(req.body || {}) }
    });
    return res.json({
      success: true,
      applicant: aNode ? aNode.properties : null,
      referringOrg: oNode ? oNode.properties : null
    });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'applicant.update',
      resourceType: 'applicant',
      resourceId: id,
      success: false,
      message: 'Failed to update applicant',
      details: { error: err.message }
    });
    console.error('ERROR: Failed to update applicant', {
      applicantId: id,
      message: err.message,
      stack: err.stack,
      payload: {
        name,
        kinshipRole,
        contact,
        email,
        address,
        language,
        community,
        contactTime,
        notes,
        newsKeywords
      }
    });
    return res.status(500).json({ error: 'Failed to update applicant', details: err.message });
  }
}

/**
 * Create new case via intake form
 */
async function createIntake(req, res, driver, auditLogger) {
  try {
    const data = req.body;
    const staff = req.user.name || req.user.email || '';
    const session = driver.session();
    // Generate a unique id for the applicant (e.g., A + timestamp)
    const applicantId = 'A' + Date.now();
    // Create Applicant node with id
    const applicantResult = await session.run(
      `CREATE (a:Applicant {id: $id, name: $name, kinshipRole: $kinshipRole, contact: $contact, email: $email, address: $address, language: $language, community: $community, contactTime: $contactTime, staff: $staff, notes: $notes, smsOptIn: $smsOptIn, emailOptIn: $emailOptIn, status: $status}) RETURN a`,
      {
        id: applicantId,
        name: data.applicantName || '',
        kinshipRole: data.kinshipRole || '',
        contact: data.contact || '',
        email: data.email || '',
        address: data.address || '',
        language: data.language || '',
        community: data.community || '',
        contactTime: data.contactTime || '',
        staff,
        notes: data.notes || '',
        smsOptIn: data.smsOptIn === true || data.smsOptIn === 'true',
        emailOptIn: data.emailOptIn === true || data.emailOptIn === 'true',
        status: data.clientStatus || ''
      }
    );
    // Create LovedOne node if provided
    let lovedOneNode = null;
    if (data.lovedOneName || data.relationship) {
      const lovedOneId = 'L' + Date.now() + '-' + Math.floor(Math.random()*1e6);
      const lovedOneResult = await session.run(
        `CREATE (l:LovedOne {id: $id, name: $name, dateOfIncident: $dateOfIncident, lastLocation: $lastLocation, community: $community, lastLocationLat: $lastLocationLat, lastLocationLon: $lastLocationLon, policeInvestigationNumber: $policeInvestigationNumber, investigation: $investigation, otherInvestigation: $otherInvestigation, supportSelections: $supportSelections, otherSupport: $otherSupport, additionalNotes: $additionalNotes, status: $status}) RETURN l`,
        {
          id: lovedOneId,
          name: data.lovedOneName || '',
          dateOfIncident: data.incidentDate || '',
          lastLocation: data.lastLocation || '',
          community: data.lovedOneCommunity || '',
          lastLocationLat: (data.lastLocationLat !== undefined && data.lastLocationLat !== '' ? parseFloat(data.lastLocationLat) : null),
          lastLocationLon: (data.lastLocationLon !== undefined && data.lastLocationLon !== '' ? parseFloat(data.lastLocationLon) : null),
          policeInvestigationNumber: data.policeInvestigationNumber || '',
          investigation: Array.isArray(data.investigation) ? data.investigation : [],
          otherInvestigation: data.otherInvestigation || '',
          supportSelections: Array.isArray(data.support) ? data.support : [],
          otherSupport: data.otherSupport || '',
          additionalNotes: data.notes || '',
          status: data.lovedOneStatus || ''
        }
      );
      lovedOneNode = lovedOneResult.records[0]?.get('l');
      // Create relationship
      await session.run(
        `MATCH (a:Applicant {id: $applicantId}), (l:LovedOne {id: $lovedOneId}) CREATE (a)-[:RELATED_TO {relationship: $relationship}]->(l)`,
        {
          applicantId,
          lovedOneId,
          relationship: data.relationship || ''
        }
      );
    }
    // Add support services as nodes and relationships
    if (Array.isArray(data.support)) {
      for (const type of data.support) {
        await session.run(
          `MERGE (s:SupportService {type: $type}) WITH s MATCH (a:Applicant {email: $email}) MERGE (a)-[:REQUESTED]->(s)`,
          { type, email: data.email || '' }
        );
      }
    }
    // Add notes as a property on Applicant
    if (data.notes) {
      await session.run(
        `MATCH (a:Applicant {email: $email}) SET a.notes = $notes`,
        { email: data.email || '', notes: data.notes }
      );
    }
    // Create REFERRED_BY relationship if referringOrganization is provided
    if (data.referringOrganization) {
      await session.run(
        `MATCH (a:Applicant {id: $id}), (o:Organization {name: $orgName}) MERGE (a)-[:REFERRED_BY]->(o)`,
        { id: applicantId, orgName: data.referringOrganization }
      );
    }
    await session.close();
    await auditLogger.log(req, {
      action: 'applicant.create',
      resourceType: 'applicant',
      resourceId: applicantId,
      success: true,
      details: {
        staff,
        hasLovedOne: Boolean(lovedOneNode),
        referringOrganization: data.referringOrganization || null
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    await auditLogger.log(req, {
      action: 'applicant.create',
      resourceType: 'applicant',
      resourceId: null,
      success: false,
      message: 'Failed to save intake form',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to save intake form.' });
  }
}

/**
 * Assign case to a case worker (admin only)
 */
async function assignCase(req, res, driver, auditLogger) {
  const { caseId } = req.params;
  const { email } = req.body; // case worker email
  console.log('Assigning case', caseId, 'to user', email);
  if (!caseId || !email) {
    console.error('Missing caseId or email for assignment');
    await auditLogger.log(req, {
      action: 'case.assign',
      resourceType: 'case',
      resourceId: caseId || null,
      success: false,
      message: 'Missing caseId or email',
      details: { caseId, email }
    });
    return res.status(400).json({ error: 'Missing caseId or email' });
  }
  const session = driver.session();
  try {
    // Remove all existing ASSIGNED_TO relationships for this case
    await session.run(
      `MATCH (u:User)-[r:ASSIGNED_TO]->(a:Applicant {id: $caseId}) DELETE r`,
      { caseId }
    );
    // Create new assignment
    await session.run(
      `MATCH (a:Applicant {id: $caseId}), (u:User {email: $email}) MERGE (u)-[:ASSIGNED_TO]->(a)`,
      { caseId, email }
    );
    // Log assignment as CaseEvent so it appears in Case Notes
    try {
      const eventId = require('uuid').v4();
      const timestamp = new Date().toISOString();
      await session.run(
        `MATCH (a:Applicant {id: $id})
         OPTIONAL MATCH (u:User {email: $email})
         CREATE (e:CaseEvent {
           eventId: $eventId,
           type: 'assignment',
           description: coalesce('Assigned to advocate ' + u.name, 'Assigned to advocate ' + $email),
           timestamp: $timestamp,
           user: $actor
         })
         CREATE (a)-[:HAS_EVENT]->(e)`,
        {
          id: caseId,
          email,
          eventId,
          timestamp,
          actor: (req.user && (req.user.email || req.user.name || req.user.preferred_username)) || 'system'
        }
      );
    } catch (e) {
      console.warn('Failed to log assignment event for case', caseId, e.message);
    }
    console.log('Case assigned successfully');
    await auditLogger.log(req, {
      action: 'case.assign',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: { assignedTo: email }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Assignment failed:', err);
    await auditLogger.log(req, {
      action: 'case.assign',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Assignment failed',
      details: { error: err.message, assignedTo: email }
    });
    res.status(500).json({ error: 'Assignment failed' });
  } finally {
    await session.close();
  }
}

/**
 * Unassign all case workers from a case (admin only)
 */
async function unassignCase(req, res, driver, auditLogger) {
  const { caseId } = req.params;
  console.log('[DEBUG] Unassign request received for caseId:', caseId);
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User)-[r:ASSIGNED_TO]->(a:Applicant {id: $caseId}) DELETE r RETURN COUNT(r) AS deletedCount`,
      { caseId }
    );
    const deletedCount = result.records.length > 0 ? result.records[0].get('deletedCount').toInt() : 0;
    console.log('[DEBUG] Unassign result for caseId', caseId, ': deletedCount =', deletedCount);
    // Log unassignment as CaseEvent so it appears in Case Notes
    try {
      const eventId = require('uuid').v4();
      const timestamp = new Date().toISOString();
      await session.run(
        `MATCH (a:Applicant {id: $id})
         CREATE (e:CaseEvent {
           eventId: $eventId,
           type: 'unassignment',
           description: 'All advocates unassigned from case',
           timestamp: $timestamp,
           user: $actor
         })
         CREATE (a)-[:HAS_EVENT]->(e)`,
        {
          id: caseId,
          eventId,
          timestamp,
          actor: (req.user && (req.user.email || req.user.name || req.user.preferred_username)) || 'system'
        }
      );
    } catch (e) {
      console.warn('Failed to log unassignment event for case', caseId, e.message);
    }
    await auditLogger.log(req, {
      action: 'case.unassign_all',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: { removedAssignments: deletedCount }
    });
    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error('[DEBUG] Unassign error for caseId', caseId, ':', err);
    await auditLogger.log(req, {
      action: 'case.unassign_all',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to unassign case',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to unassign case' });
  } finally {
    await session.close();
  }
}

/**
 * Add event to a case
 */
async function addCaseEvent(req, res, caseEventModel, auditLogger) {
  const { caseId } = req.params;
  const event = {
    type: req.body.type,
    description: req.body.description,
    timestamp: req.body.timestamp,
    user: req.user.preferred_username || req.user.email
  };
  try {
    const created = await caseEventModel.addEvent(caseId, event);
    await auditLogger.log(req, {
      action: 'case.event_create',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: {
        type: event.type,
        timestamp: event.timestamp
      }
    });
    res.json({ event: created });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'case.event_create',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to add case event',
      details: { error: err.message, type: event.type }
    });
    res.status(500).json({ error: 'Failed to add event' });
  }
}

/**
 * Get all events for a case
 */
async function getCaseEvents(req, res, caseEventModel, auditLogger) {
  const { caseId } = req.params;
  const events = await caseEventModel.getEvents(caseId);
  res.json({ events });
}

/**
 * Send SMS for a case
 */
async function sendCaseSms(req, res, driver, smsService, caseEventModel, auditLogger) {
  if (!smsService.isConfigured()) {
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: req.params?.caseId || null,
      success: false,
      message: 'SMS service not configured'
    });
    return res.status(503).json({ error: 'SMS service is not configured' });
  }
  const { caseId } = req.params;
  const { to, message } = req.body || {};
  const trimmedMessage = (message || '').trim();
  if (!to || !trimmedMessage) {
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Destination number and message are required'
    });
    return res.status(400).json({ error: 'Destination number and message are required' });
  }
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAdmin = roles.includes('admin');
  const userEmail = req.user.email || req.user.preferred_username;
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isAdmin) {
    const session = driver.session();
    try {
      const result = await session.run(
        'MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a',
        { caseId, email: userEmail }
      );
      const isAssigned = result.records.length > 0;
      if (!isAssigned) {
        await auditLogger.log(req, {
          action: 'case.sms_send',
          resourceType: 'case',
          resourceId: caseId,
          success: false,
          message: 'Not authorized to send SMS for this case'
        });
        return res.status(403).json({ error: 'Not authorized to send SMS for this case' });
      }
    } catch (err) {
      console.error('Failed to verify case assignment before sending SMS:', err);
      await auditLogger.log(req, {
        action: 'case.sms_send',
        resourceType: 'case',
        resourceId: caseId,
        success: false,
        message: 'Failed to verify assignment',
        details: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to verify assignment', details: err.message });
    } finally {
      await session.close();
    }
  }

  try {
    const smsResult = await smsService.sendSms({ to, body: trimmedMessage });
    const snippet = trimmedMessage.length > 160 ? `${trimmedMessage.slice(0, 157)}...` : trimmedMessage;
    const description = `SMS sent to ${to}: "${snippet}"`;
    try {
      await caseEventModel.addEvent(caseId, {
        type: 'sms',
        description,
        user: req.user.name || userEmail
      });
    } catch (logErr) {
      console.warn('SMS sent but failed to log case event:', logErr);
    }
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: {
        to,
        messageLength: trimmedMessage.length
      }
    });
    res.json({ success: true, sid: smsResult.sid });
  } catch (err) {
    console.error('Failed to send SMS via Twilio:', err);
    await auditLogger.log(req, {
      action: 'case.sms_send',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to send SMS',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to send SMS', details: err.message });
  }
}

/**
 * Get all files for a case
 */
async function getCaseFiles(req, res, driver, auditLogger) {
  const { caseId } = req.params;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Applicant {id: $caseId})-[:HAS_FILE]->(f:File)
       RETURN f ORDER BY f.uploadedAt DESC`,
      { caseId }
    );
    const files = result.records.map(r => r.get('f').properties);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch files' });
  } finally {
    await session.close();
  }
}

/**
 * Upload file for a case
 */
async function uploadCaseFile(req, res, driver, upload, auditLogger) {
  const { caseId } = req.params;
  if (!req.file) {
    await auditLogger.log(req, {
      action: 'case.file_upload',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'No file uploaded'
    });
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const session = driver.session();
  try {
    // Save file metadata and link to case
    const fileMeta = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user.email || req.user.name,
      uploadedAt: new Date().toISOString()
    };
    // Create File node and link to Applicant (case)
    await session.run(
      `MATCH (a:Applicant {id: $id})
      CREATE (f:File {filename: $filename, originalname: $originalname, path: $path, mimetype: $mimetype, size: $size, uploadedBy: $uploadedBy, uploadedAt: $uploadedAt})
      CREATE (a)-[:HAS_FILE]->(f)`,
      { id: caseId, ...fileMeta }
    );

    // Add a CaseEvent for the file upload
    const eventId = require('uuid').v4();
    await session.run(
      `MATCH (a:Applicant {id: $id})
       CREATE (e:CaseEvent {
         eventId: $eventId,
         type: 'file_upload',
         description: $description,
         timestamp: $timestamp,
         user: $user,
         filename: $filename,
         originalname: $originalname
       })
       CREATE (a)-[:HAS_EVENT]->(e)`,
      {
        id: caseId,
        eventId,
        description: `File '${fileMeta.originalname}' uploaded by ${fileMeta.uploadedBy}`,
        timestamp: fileMeta.uploadedAt,
        user: fileMeta.uploadedBy,
        filename: fileMeta.filename,
        originalname: fileMeta.originalname
      }
    );

    await auditLogger.log(req, {
      action: 'case.file_upload',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: {
        filename: fileMeta.filename,
        originalname: fileMeta.originalname,
        size: fileMeta.size
      }
    });
    res.json({ success: true, file: fileMeta });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'case.file_upload',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to save file metadata',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to save file metadata' });
  } finally {
    await session.close();
  }
}

/**
 * Delete file for a case
 */
async function deleteCaseFile(req, res, driver, auditLogger) {
  const { caseId, filename } = req.params;
  const fs = require('fs');
  const path = require('path');
  const session = driver.session();
  try {
    // Find and delete File node and relationship
    await session.run(
      `MATCH (a:Applicant {id: $caseId})-[:HAS_FILE]->(f:File {filename: $filename})
       DETACH DELETE f`,
      { caseId, filename }
    );
    // Delete file from disk
    const filePath = path.join(__dirname, '..', 'uploads', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await auditLogger.log(req, {
      action: 'case.file_delete',
      resourceType: 'case',
      resourceId: caseId,
      success: true,
      details: { filename }
    });
    res.json({ success: true });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'case.file_delete',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to delete file',
      details: { filename, error: err.message }
    });
    res.status(500).json({ error: 'Failed to delete file' });
  } finally {
    await session.close();
  }
}

/**
 * Get all notes for a case
 */
async function getCaseNotes(req, res, driver, auditLogger) {
  const { caseId } = req.params;
  const user = req.user;
  try {
    const session = driver.session();
    let canView = false;
    if (user.roles && user.roles.includes('admin')) {
      canView = true;
    } else {
      const result = await session.run('MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a', { caseId, email: user.email || user.preferred_username });
      canView = result.records.length > 0;
    }
    if (!canView) {
      await session.close();
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Fetch related Note nodes
    const notesResult = await session.run('MATCH (a:Applicant {id: $caseId})-[:HAS_NOTE]->(n:Note) RETURN n ORDER BY n.timestamp', { caseId });
    const notes = notesResult.records.map(r => r.get('n').properties);
    await session.close();
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
}

/**
 * Add note to a case
 */
async function addCaseNote(req, res, driver, auditLogger) {
  const { caseId } = req.params;
  const { text } = req.body;
  const user = req.user;
  if (!text || !text.trim()) {
    await auditLogger.log(req, {
      action: 'case.note_create',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Note text required'
    });
    return res.status(400).json({ error: 'Note text required' });
  }
  try {
    const session = driver.session();
    let canEdit = false;
    if (user.roles && user.roles.includes('admin')) {
      canEdit = true;
    } else {
      const result = await session.run('MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a', { caseId, email: user.email || user.preferred_username });
      canEdit = result.records.length > 0;
    }
    if (!canEdit) {
      await session.close();
      await auditLogger.log(req, {
        action: 'case.note_create',
        resourceType: 'case',
        resourceId: caseId,
        success: false,
        message: 'Not authorized to add note'
      });
      return res.status(403).json({ error: 'Not authorized' });
    }
    const timestamp = new Date().toISOString();
    // Create Note node and relate to Applicant
    await session.run('MATCH (a:Applicant {id: $caseId}) CREATE (n:Note {text: $text, author: $author, timestamp: $timestamp}) CREATE (a)-[:HAS_NOTE]->(n)', {
      caseId,
      text,
      author: user.name || user.email || user.preferred_username,
      timestamp
    });
    await session.close();
    await auditLogger.log(req, {
      action: 'case.note_create',
      resourceType: 'case',
      resourceId: caseId,
      success: true
    });
    res.json({ success: true });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'case.note_create',
      resourceType: 'case',
      resourceId: caseId,
      success: false,
      message: 'Failed to add note',
      details: { error: err.message }
    });
    res.status(500).json({ error: 'Failed to add note' });
  }
}

/**
 * Add loved one to an applicant
 */
async function addLovedOne(req, res, driver, auditLogger) {
  const { id } = req.params;
  const { name, relationship, incidentDate, lastLocation, community, policeInvestigationNumber, investigation, otherInvestigation, supportSelections, support, otherSupport, additionalNotes, status } = req.body || {};
  const user = req.user;
  if (!name || !name.trim()) {
    await auditLogger.log(req, {
      action: 'loved_one.create',
      resourceType: 'loved_one',
      resourceId: null,
      success: false,
      message: 'Loved One name is required',
      details: { applicantId: id }
    });
    return res.status(400).json({ error: 'Loved One name is required' });
  }
  const session = driver.session();
  try {
    // Permission: admin or assigned to this case
    let canEdit = false;
    const rawUserRoles = (user && (user.roles || user.groups || user.roles_claim)) || [];
    const userRoles = (Array.isArray(rawUserRoles) ? rawUserRoles : [rawUserRoles])
      .filter(Boolean)
      .map(r => String(r).toLowerCase());
    if (userRoles.includes('admin')) {
      canEdit = true;
    } else {
      const result = await session.run('MATCH (a:Applicant {id: $caseId})<-[:ASSIGNED_TO]-(u:User {email: $email}) RETURN a', { caseId: id, email: user.email || user.preferred_username });
      canEdit = result.records.length > 0;
    }
    if (!canEdit) {
      await session.close();
      await auditLogger.log(req, {
        action: 'loved_one.create',
        resourceType: 'loved_one',
        resourceId: null,
        success: false,
        message: 'Not authorized to add loved one',
        details: { applicantId: id }
      });
      return res.status(403).json({ error: 'Not authorized' });
    }
    const lovedOneId = 'L' + Date.now() + '-' + Math.floor(Math.random()*1e6);
    const investigationList = Array.isArray(investigation) ? investigation : [];
    const supportList = Array.isArray(supportSelections) ? supportSelections : (Array.isArray(support) ? support : []);
    const createRes = await session.run(
      `MATCH (a:Applicant {id: $applicantId})
       CREATE (l:LovedOne {
         id: $id,
         name: $name,
         dateOfIncident: $dateOfIncident,
         lastLocation: $lastLocation,
         community: $community,
         policeInvestigationNumber: $policeInvestigationNumber,
         investigation: $investigation,
         otherInvestigation: $otherInvestigation,
         supportSelections: $supportSelections,
         otherSupport: $otherSupport,
         additionalNotes: $additionalNotes,
         status: $status
       })
       CREATE (a)-[:RELATED_TO {relationship: $relationship}]->(l)
       RETURN l`,
      {
        applicantId: id,
        id: lovedOneId,
        name: name.trim(),
        dateOfIncident: incidentDate || '',
        lastLocation: lastLocation || '',
        community: community || '',
        policeInvestigationNumber: policeInvestigationNumber || '',
        investigation: investigationList,
        otherInvestigation: otherInvestigation || '',
        supportSelections: supportList,
        otherSupport: otherSupport || '',
        additionalNotes: additionalNotes || '',
        status: status || '',
        relationship: relationship || ''
      }
    );
    await session.close();
    await auditLogger.log(req, {
      action: 'loved_one.create',
      resourceType: 'loved_one',
      resourceId: lovedOneId,
      success: true,
      details: { applicantId: id, name: name.trim() }
    });
    res.json({ success: true, lovedOne: createRes.records[0]?.get('l')?.properties });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'loved_one.create',
      resourceType: 'loved_one',
      resourceId: null,
      success: false,
      message: 'Failed to add loved one',
      details: { error: err.message, applicantId: id }
    });
    res.status(500).json({ error: 'Failed to add loved one', details: err.message });
  }
}

module.exports = {
  getAllCases,
  searchApplicants,
  getApplicantById,
  getApplicantComplete,
  getMyCases,
  getCaseWorkerCases,
  getApplicantsWithPhoneNumbers,
  getApplicantsWithEmailAddresses,
  getApplicantsByProvince,
  updateApplicant,
  createIntake,
  assignCase,
  unassignCase,
  addCaseEvent,
  getCaseEvents,
  sendCaseSms,
  getCaseFiles,
  uploadCaseFile,
  deleteCaseFile,
  getCaseNotes,
  addCaseNote,
  addLovedOne
};

