// auditLogModel.js
// Model and Neo4j queries for audit logging

const { v4: uuidv4 } = require('uuid');

class AuditLogModel {
  constructor(driver) {
    this.driver = driver;
  }

  async logAction({ user, action, details }) {
    const session = this.driver.session();
    try {
      const logId = uuidv4();
      const timestamp = new Date().toISOString();
      await session.run(
        'CREATE (a:AuditLog {logId: $logId, user: $user, action: $action, details: $details, timestamp: $timestamp})',
        { logId, user, action, details: JSON.stringify(details), timestamp }
      );
    } finally {
      await session.close();
    }
  }

  async getLogs(limit = 100) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (a:AuditLog) RETURN a ORDER BY a.timestamp DESC LIMIT $limit',
        { limit: Number(limit) }
      );
      return result.records.map(r => r.get('a').properties);
    } finally {
      await session.close();
    }
  }
}

module.exports = AuditLogModel;
