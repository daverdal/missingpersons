/**
 * Public Controller
 * Handles unauthenticated endpoints surfaced on the public-facing site.
 */

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

function sanitizeText(value = '', maxLength = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return value;
}

/**
 * Handle submissions from the public contact form.
 */
async function submitContactInquiry(req, res, driver, auditLogger) {
  const {
    fullName,
    email,
    phone,
    community,
    preferredContactMethod,
    message
  } = req.body || {};

  const safeName = sanitizeText(fullName, 180);
  const safeEmail = sanitizeText(email, 254).toLowerCase();
  const safePhone = sanitizeText(phone || '', 50);
  const safeCommunity = sanitizeText(community || '', 120);
  const safePreferred = sanitizeText(preferredContactMethod || '', 40).toLowerCase();
  const safeMessage = sanitizeText(message, 2000);

  if (!safeName || !safeEmail || !safeMessage) {
    return res.status(400).json({ error: 'fullName, email, and message are required.' });
  }
  if (!isValidEmail(safeEmail)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const session = driver.session();
  const inquiryId = uuidv4();
  const timestamp = new Date().toISOString();
  const payload = {
    id: inquiryId,
    fullName: safeName,
    email: safeEmail,
    phone: safePhone || null,
    community: safeCommunity || null,
    preferredContactMethod: safePreferred || 'unspecified',
    message: safeMessage,
    source: 'public_form',
    status: 'new',
    createdAt: timestamp,
    ipAddress: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
  };

  try {
    await session.run(
      `CREATE (p:PublicInquiry {
        id: $id,
        fullName: $fullName,
        email: $email,
        phone: $phone,
        community: $community,
        preferredContactMethod: $preferredContactMethod,
        message: $message,
        source: $source,
        status: $status,
        createdAt: $createdAt,
        ipAddress: $ipAddress
      })`,
      payload
    );

    await auditLogger.log(req, {
      action: 'public.contact_submission',
      resourceType: 'public_inquiry',
      resourceId: inquiryId,
      success: true,
      details: {
        community: payload.community,
        preferredContactMethod: payload.preferredContactMethod
      }
    });

    res.json({ success: true, message: 'Inquiry received. A case worker will reach out shortly.' });
  } catch (err) {
    await auditLogger.log(req, {
      action: 'public.contact_submission',
      resourceType: 'public_inquiry',
      resourceId: inquiryId,
      success: false,
      level: 'error',
      message: 'Failed to persist public inquiry',
      details: { error: err.message }
    });
    console.error('Failed to save public inquiry:', err);
    res.status(500).json({ error: 'Unable to submit inquiry right now. Please try again later.' });
  } finally {
    await session.close();
  }
}

/**
 * Return a public-safe list of Loved Ones that are still considered missing.
 */
async function getPublicLovedOnes(req, res, driver) {
  const {
    community,
    province,
    status,
    search,
    limit
  } = req.query || {};

  const resolvedStatuses = ['found safe', 'found deceased', 'case closed', 'voluntary return'];
  const session = driver.session();
  const params = {
    resolvedStatuses,
    limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
  };

  const filters = [];
  if (!status) {
    filters.push('NOT toLower(coalesce(l.status, "active")) IN $resolvedStatuses');
  } else {
    params.status = status.trim();
    filters.push('toLower(coalesce(l.status, "")) = toLower($status)');
  }
  if (community) {
    params.community = community.trim();
    filters.push('toLower(coalesce(l.community, "")) CONTAINS toLower($community)');
  }
  if (province) {
    params.province = province.trim();
    filters.push('toUpper(coalesce(l.province, "")) = toUpper($province)');
  }
  if (search) {
    params.search = search.trim();
    filters.push('(' +
      'toLower(coalesce(l.name, "")) CONTAINS toLower($search) OR ' +
      'toLower(coalesce(l.lastLocation, "")) CONTAINS toLower($search) OR ' +
      'toLower(coalesce(l.community, "")) CONTAINS toLower($search)' +
    ')');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const result = await session.run(
      `
      MATCH (l:LovedOne)
      OPTIONAL MATCH (a:Applicant)-[rel:RELATED_TO]->(l)
      ${whereClause}
      RETURN l, rel.relationship AS relationship, a.name AS applicantName
      ORDER BY coalesce(l.dateOfIncident, '') DESC, l.name
      LIMIT $limit
      `,
      params
    );

    const lovedOnes = result.records.map(record => {
      const lovedOneNode = record.get('l');
      const props = lovedOneNode ? lovedOneNode.properties : {};
      const applicantName = record.get('applicantName');
      return {
        id: props.id,
        name: props.name || 'Unnamed Loved One',
        community: props.community || '',
        province: props.province || '',
        lastLocation: props.lastLocation || '',
        dateOfIncident: props.dateOfIncident || null,
        status: props.status || 'Active',
        relationship: record.get('relationship') || '',
        coordinates: (props.lastLocationLat !== undefined && props.lastLocationLon !== undefined)
          ? {
              lat: toNumber(props.lastLocationLat),
              lon: toNumber(props.lastLocationLon)
            }
          : null,
        summary: props.additionalNotes ? sanitizeText(props.additionalNotes, 280) : null,
        photoUrl: props.photoUrl || null,
        familyContactInitials: applicantName
          ? applicantName
              .split(/\s+/)
              .filter(Boolean)
              .map(part => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
          : null
      };
    });

    res.json({ results: lovedOnes });
  } catch (err) {
    console.error('Failed to fetch public loved ones list:', err);
    res.status(500).json({ error: 'Unable to fetch loved ones right now.' });
  } finally {
    await session.close();
  }
}

/**
 * Get all public inquiries (admin and case_worker only)
 */
async function getPublicInquiries(req, res, driver, auditLogger) {
  const { status, limit } = req.query || {};
  
  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAllowed = roles.includes('admin') || roles.includes('case_worker');
  if (!isAllowed) {
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  }

  const session = driver.session();
  const limitValue = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const params = {
    limit: neo4j.int(limitValue)
  };

  let cypherQuery;
  if (status && status.trim()) {
    params.status = status.trim();
    cypherQuery = `MATCH (p:PublicInquiry)
      WHERE toLower(p.status) = toLower($status)
      RETURN p
      ORDER BY coalesce(p.createdAt, '') DESC
      LIMIT $limit`;
  } else {
    cypherQuery = `MATCH (p:PublicInquiry)
      RETURN p
      ORDER BY coalesce(p.createdAt, '') DESC
      LIMIT $limit`;
  }

  try {
    const result = await session.run(cypherQuery, params);

    const inquiries = result.records.map(record => {
      const props = record.get('p').properties;
      return {
        id: props.id,
        fullName: props.fullName || '',
        email: props.email || '',
        phone: props.phone || null,
        community: props.community || null,
        preferredContactMethod: props.preferredContactMethod || 'unspecified',
        message: props.message || '',
        source: props.source || 'public_form',
        status: props.status || 'new',
        createdAt: props.createdAt || null,
        ipAddress: props.ipAddress || null
      };
    });

    res.json({ results: inquiries });
  } catch (err) {
    console.error('Failed to fetch public inquiries:', err);
    res.status(500).json({ error: 'Failed to fetch public inquiries', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Update public inquiry status (admin and case_worker only)
 */
async function updatePublicInquiryStatus(req, res, driver, auditLogger) {
  const { id } = req.params;
  const { status } = req.body || {};

  const rawRoles = (req.user && (req.user.roles || req.user.groups || req.user.roles_claim)) || [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .filter(Boolean)
    .map(r => String(r).toLowerCase());
  const isAllowed = roles.includes('admin') || roles.includes('case_worker');
  if (!isAllowed) {
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  }

  if (!status || !status.trim()) {
    return res.status(400).json({ error: 'status is required' });
  }

  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (p:PublicInquiry {id: $id})
       SET p.status = $status
       RETURN p`,
      { id, status: status.trim() }
    );

    if (result.records.length === 0) {
      await session.close();
      return res.status(404).json({ error: 'Public inquiry not found' });
    }

    const inquiry = result.records[0].get('p').properties;
    await session.close();

    await auditLogger.log(req, {
      action: 'public_inquiry.update_status',
      resourceType: 'public_inquiry',
      resourceId: id,
      success: true,
      details: { status: status.trim() }
    });

    res.json({ success: true, inquiry });
  } catch (err) {
    await session.close();
    await auditLogger.log(req, {
      action: 'public_inquiry.update_status',
      resourceType: 'public_inquiry',
      resourceId: id,
      success: false,
      message: 'Failed to update public inquiry status',
      details: { error: err.message }
    });
    console.error('Failed to update public inquiry status:', err);
    res.status(500).json({ error: 'Failed to update public inquiry status' });
  }
}

module.exports = {
  getPublicLovedOnes,
  submitContactInquiry,
  getPublicInquiries,
  updatePublicInquiryStatus
};


