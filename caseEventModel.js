// caseEventModel.js
// Model and Neo4j queries for case event/timeline tracking

const { v4: uuidv4 } = require('uuid');

class CaseEventModel {
  constructor(driver) {
    this.driver = driver;
  }

  async addEvent(caseId, event) {
    const session = this.driver.session();
    try {
      const eventId = uuidv4();
      const params = {
        caseId,
        eventId,
        type: event.type,
        description: event.description,
        timestamp: event.timestamp || new Date().toISOString(),
        user: event.user
      };
      await session.run(
        `MATCH (c:Case {caseId: $caseId})
         CREATE (e:CaseEvent {eventId: $eventId, type: $type, description: $description, timestamp: $timestamp, user: $user})
         CREATE (c)-[:HAS_EVENT]->(e)`,
        params
      );
      return params;
    } finally {
      await session.close();
    }
  }

  async getEvents(caseId) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (c:Case {caseId: $caseId})-[:HAS_EVENT]->(e:CaseEvent)
         RETURN e ORDER BY e.timestamp ASC`,
        { caseId }
      );
      return result.records.map(r => r.get('e').properties);
    } finally {
      await session.close();
    }
  }
}

module.exports = CaseEventModel;
