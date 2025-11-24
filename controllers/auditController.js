/**
 * Audit Log Controller
 * Handles all audit log operations
 */

/**
 * Get audit logs with filtering
 */
async function getAuditLogs(req, res, auditLogModel, auditLogger) {
  const {
    limit,
    cursor,
    cursorLogId,
    action,
    user,
    resourceType,
    resourceId,
    success,
    from,
    to,
    search
  } = req.query || {};

  const filters = {};
  if (action) filters.action = action;
  if (user) filters.user = user;
  if (resourceType) filters.resourceType = resourceType;
  if (resourceId) filters.resourceId = resourceId;
  if (from) filters.from = from;
  if (to) filters.to = to;
  if (search) filters.search = search;
  if (typeof success === 'string' && success.length > 0) {
    if (success.toLowerCase() === 'true') filters.success = true;
    else if (success.toLowerCase() === 'false') filters.success = false;
  }

  try {
    const result = await auditLogModel.getLogs({
      limit,
      cursor,
      cursorLogId,
      filters
    });
    res.json(result);
  } catch (err) {
    console.error('Failed to fetch audit logs', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
}

/**
 * Real-time audit log stream (Server-Sent Events)
 */
function streamAuditLogs(req, res, auditLogger) {
  auditLogger.addStreamClient(req, res);
  res.write('event: connected\ndata: {}\n\n');
}

module.exports = {
  getAuditLogs,
  streamAuditLogs
};

