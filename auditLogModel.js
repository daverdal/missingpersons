// AuditLogModel.js
// Neo4j persistence layer for audit trail entries

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

class AuditLogModel {
  constructor(driver, database = 'neo4j') {
    this.driver = driver;
    this.database = database;
  }

  async ensureIndexes() {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        'CREATE INDEX audit_log_timestamp IF NOT EXISTS FOR (a:AuditLog) ON (a.timestamp)'
      );
      await session.run(
        'CREATE INDEX audit_log_action IF NOT EXISTS FOR (a:AuditLog) ON (a.action)'
      );
      await session.run(
        'CREATE INDEX audit_log_resource IF NOT EXISTS FOR (a:AuditLog) ON (a.resourceId)'
      );
    } finally {
      await session.close();
    }
  }

  async logAction(entry) {
    const {
      logId = uuidv4(),
      timestamp = new Date().toISOString(),
      userId = null,
      userName = null,
      roles = [],
      action,
      resourceType = null,
      resourceId = null,
      ip = null,
      success = true,
      level = 'info',
      message = null,
      details = '{}',
      targetUserId = null,
      targetUserName = null
    } = entry || {};

    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `CREATE (a:AuditLog {
          logId: $logId,
          timestamp: $timestamp,
          userId: $userId,
          userName: $userName,
          roles: $roles,
          action: $action,
          resourceType: $resourceType,
          resourceId: $resourceId,
          ip: $ip,
          success: $success,
          level: $level,
          message: $message,
          details: $details,
          targetUserId: $targetUserId,
          targetUserName: $targetUserName
        })`,
        {
          logId,
          timestamp,
          userId,
          userName,
          roles,
          action,
          resourceType,
          resourceId,
          ip,
          success: Boolean(success),
          level,
          message,
          details: typeof details === 'string' ? details : JSON.stringify(details || {}),
          targetUserId,
          targetUserName
        }
      );
      return {
        logId,
        timestamp,
        userId,
        userName,
        roles,
        action,
        resourceType,
        resourceId,
        ip,
        success: Boolean(success),
        level,
        message,
        details: this.#parseDetails(details),
        targetUserId,
        targetUserName
      };
    } finally {
      await session.close();
    }
  }

  async getLogs(options = {}) {
    const {
      limit = DEFAULT_LIMIT,
      cursor,
      filters = {}
    } = options;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const params = { limit: neo4j.int(safeLimit) };
    const whereClauses = [];

    if (filters.action) {
      params.action = filters.action;
      whereClauses.push('a.action = $action');
    }

    if (filters.user) {
      params.user = filters.user.toLowerCase();
      whereClauses.push('(toLower(coalesce(a.userId, "")) CONTAINS $user OR toLower(coalesce(a.userName, "")) CONTAINS $user)');
    }

    if (filters.resourceType) {
      params.resourceType = filters.resourceType;
      whereClauses.push('a.resourceType = $resourceType');
    }

    if (filters.resourceId) {
      params.resourceId = filters.resourceId;
      whereClauses.push('a.resourceId = $resourceId');
    }

    if (typeof filters.success === 'boolean') {
      params.success = filters.success;
      whereClauses.push('a.success = $success');
    }

    if (filters.from) {
      params.from = filters.from;
      whereClauses.push('a.timestamp >= $from');
    }

    if (filters.to) {
      params.to = filters.to;
      whereClauses.push('a.timestamp <= $to');
    }

    if (filters.search) {
      params.search = filters.search.toLowerCase();
      whereClauses.push('(toLower(coalesce(a.details, "")) CONTAINS $search OR toLower(coalesce(a.message, "")) CONTAINS $search OR toLower(coalesce(a.action, "")) CONTAINS $search)');
    }

    if (cursor) {
      params.cursor = cursor;
      params.cursorLogId = options.cursorLogId || '';
      whereClauses.push('(a.timestamp < $cursor OR (a.timestamp = $cursor AND a.logId < $cursorLogId))');
    }

    const session = this.driver.session({ database: this.database });
    try {
      const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const query = `
        MATCH (a:AuditLog)
        ${where}
        RETURN a
        ORDER BY a.timestamp DESC, a.logId DESC
        LIMIT $limit
      `;

      const result = await session.run(query, params);
      const logs = result.records.map(record => {
        const props = record.get('a').properties;
        return this.#recordToLog(props);
      });

      const nextCursor =
        logs.length === safeLimit
          ? { timestamp: logs[logs.length - 1].timestamp, logId: logs[logs.length - 1].logId }
          : null;

      return { logs, nextCursor };
    } finally {
      await session.close();
    }
  }

  async listActions(limit = 200) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        'MATCH (a:AuditLog) WHERE a.action IS NOT NULL RETURN DISTINCT a.action AS action ORDER BY action LIMIT $limit',
        { limit: neo4j.int(safeLimit) }
      );
      return result.records
        .map(record => record.get('action'))
        .filter(value => typeof value === 'string' && value.trim().length > 0);
    } finally {
      await session.close();
    }
  }

  async cleanupOlderThan(cutoffIso) {
    if (!cutoffIso) return;
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        'MATCH (a:AuditLog) WHERE a.timestamp < $cutoff DETACH DELETE a',
        { cutoff: cutoffIso }
      );
    } finally {
      await session.close();
    }
  }

  #recordToLog(props = {}) {
    return {
      logId: props.logId,
      timestamp: props.timestamp,
      userId: props.userId || null,
      userName: props.userName || null,
      roles: props.roles || [],
      action: props.action,
      resourceType: props.resourceType || null,
      resourceId: props.resourceId || null,
      ip: props.ip || null,
      success: typeof props.success === 'boolean' ? props.success : props.success === 'true',
      level: props.level || 'info',
      message: props.message || null,
      details: this.#parseDetails(props.details),
      targetUserId: props.targetUserId || null,
      targetUserName: props.targetUserName || null
    };
  }

  #parseDetails(details) {
    if (!details) return null;
    if (typeof details === 'object') return details;
    try {
      return JSON.parse(details);
    } catch (err) {
      return { raw: String(details) };
    }
  }
}

module.exports = AuditLogModel;
