// timelineEventModel.js
// Model and Neo4j queries for timeline event tracking for LovedOnes

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

class TimelineEventModel {
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * Add an event to a LovedOne timeline
   * @param {string} lovedOneId - The ID of the LovedOne
   * @param {object} event - Event data
   * @param {string} event.eventType - Type of event (CaseOpened, MissingReported, etc.)
   * @param {string} event.description - Human-readable description
   * @param {string} event.timestamp - ISO timestamp (defaults to now)
   * @param {string} event.createdBy - User/system who created it
   * @param {string} [event.location] - Optional location text
   * @param {object} [event.metadata] - Optional key/value metadata
   */
  async addEvent(lovedOneId, event) {
    const session = this.driver.session();
    try {
      const eventId = uuidv4();
      const params = {
        lovedOneId,
        eventId,
        eventType: event.eventType,
        description: event.description || '',
        timestamp: event.timestamp || new Date().toISOString(),
        createdBy: event.createdBy || 'system',
        location: event.location || null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null
      };

      await session.run(
        `MATCH (l:LovedOne {id: $lovedOneId})
         CREATE (e:TimelineEvent {
           eventId: $eventId,
           eventType: $eventType,
           description: $description,
           timestamp: $timestamp,
           createdBy: $createdBy,
           location: $location,
           metadata: $metadata
         })
         CREATE (l)-[:HAS_TIMELINE_EVENT]->(e)
         RETURN e`,
        params
      );

      // If event is "Found", update LovedOne status to "Found"
      if (event.eventType === 'Found') {
        await session.run(
          `MATCH (l:LovedOne {id: $lovedOneId})
           SET l.status = 'Found'`,
          { lovedOneId }
        );
      }

      return {
        eventId: params.eventId,
        lovedOneId: params.lovedOneId,
        eventType: params.eventType,
        description: params.description,
        timestamp: params.timestamp,
        createdBy: params.createdBy,
        location: params.location,
        metadata: params.metadata ? JSON.parse(params.metadata) : null
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get all events for a specific LovedOne
   * @param {string} lovedOneId - The ID of the LovedOne
   * @returns {Array} Array of event objects
   */
  async getEventsByLovedOne(lovedOneId) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (l:LovedOne {id: $lovedOneId})-[:HAS_TIMELINE_EVENT]->(e:TimelineEvent)
         RETURN e ORDER BY e.timestamp ASC`,
        { lovedOneId }
      );
      return result.records.map(r => {
        const props = r.get('e').properties;
        return {
          ...props,
          metadata: props.metadata ? JSON.parse(props.metadata) : null
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get all events across all LovedOnes (global timeline)
   * @param {object} filters - Optional filters
   * @param {string} [filters.eventType] - Filter by event type
   * @param {string} [filters.startDate] - Start date (ISO string)
   * @param {string} [filters.endDate] - End date (ISO string)
   * @param {string} [filters.community] - Filter by community
   * @param {number} [filters.limit] - Maximum number of events to return
   * @returns {Array} Array of event objects with LovedOne info
   */
  async getAllEvents(filters = {}) {
    const session = this.driver.session();
    try {
      let query = `
        MATCH (l:LovedOne)-[:HAS_TIMELINE_EVENT]->(e:TimelineEvent)
        WHERE 1=1
      `;
      const params = {};

      if (filters.eventType) {
        query += ` AND e.eventType = $eventType`;
        params.eventType = filters.eventType;
      }

      if (filters.startDate) {
        query += ` AND e.timestamp >= $startDate`;
        params.startDate = filters.startDate;
      }

      if (filters.endDate) {
        query += ` AND e.timestamp <= $endDate`;
        params.endDate = filters.endDate;
      }

      if (filters.community) {
        query += ` AND l.community = $community`;
        params.community = filters.community;
      }

      query += ` RETURN e, l ORDER BY e.timestamp DESC`;

      if (filters.limit) {
        query += ` LIMIT $limit`;
        // Ensure limit is a proper Neo4j integer (not float)
        const limitValue = parseInt(filters.limit, 10);
        if (isNaN(limitValue) || limitValue < 0) {
          throw new Error('Invalid limit value');
        }
        // Use Neo4j integer type to ensure it's not treated as float
        params.limit = neo4j.int(limitValue);
      }

      const result = await session.run(query, params);
      return result.records.map(r => {
        const eventProps = r.get('e').properties;
        const lovedOneProps = r.get('l').properties;
        return {
          eventId: eventProps.eventId,
          eventType: eventProps.eventType,
          description: eventProps.description,
          timestamp: eventProps.timestamp,
          createdBy: eventProps.createdBy,
          location: eventProps.location,
          metadata: eventProps.metadata ? JSON.parse(eventProps.metadata) : null,
          lovedOne: {
            id: lovedOneProps.id,
            name: lovedOneProps.name,
            community: lovedOneProps.community,
            status: lovedOneProps.status
          }
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get events grouped by LovedOne (for timeline visualization)
   * @param {object} filters - Optional filters (same as getAllEvents)
   * @returns {Array} Array of objects with lovedOne and events
   */
  async getEventsGroupedByLovedOne(filters = {}) {
    const session = this.driver.session();
    try {
      let query = `
        MATCH (l:LovedOne)-[:HAS_TIMELINE_EVENT]->(e:TimelineEvent)
        WHERE 1=1
      `;
      const params = {};

      if (filters.eventType) {
        query += ` AND e.eventType = $eventType`;
        params.eventType = filters.eventType;
      }

      if (filters.startDate) {
        query += ` AND e.timestamp >= $startDate`;
        params.startDate = filters.startDate;
      }

      if (filters.endDate) {
        query += ` AND e.timestamp <= $endDate`;
        params.endDate = filters.endDate;
      }

      if (filters.community) {
        query += ` AND l.community = $community`;
        params.community = filters.community;
      }

      query += ` RETURN l, collect(e) as events ORDER BY l.name`;

      const result = await session.run(query, params);
      return result.records.map(r => {
        const lovedOneProps = r.get('l').properties;
        const events = r.get('events').map(eventNode => {
          const eventProps = eventNode.properties;
          return {
            eventId: eventProps.eventId,
            eventType: eventProps.eventType,
            description: eventProps.description,
            timestamp: eventProps.timestamp,
            createdBy: eventProps.createdBy,
            location: eventProps.location,
            metadata: eventProps.metadata ? JSON.parse(eventProps.metadata) : null
          };
        });
        // Sort events by timestamp
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return {
          lovedOne: {
            id: lovedOneProps.id,
            name: lovedOneProps.name,
            community: lovedOneProps.community,
            status: lovedOneProps.status
          },
          events
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Update an existing event
   * @param {string} eventId - The ID of the event
   * @param {object} updates - Fields to update
   */
  async updateEvent(eventId, updates) {
    const session = this.driver.session();
    try {
      const setClauses = [];
      const params = { eventId };

      if (updates.description !== undefined) {
        setClauses.push('e.description = $description');
        params.description = updates.description;
      }

      if (updates.location !== undefined) {
        setClauses.push('e.location = $location');
        params.location = updates.location;
      }

      if (updates.metadata !== undefined) {
        setClauses.push('e.metadata = $metadata');
        params.metadata = JSON.stringify(updates.metadata);
      }

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      await session.run(
        `MATCH (e:TimelineEvent {eventId: $eventId})
         SET ${setClauses.join(', ')}`,
        params
      );

      // Return updated event
      const result = await session.run(
        `MATCH (e:TimelineEvent {eventId: $eventId})
         RETURN e`,
        { eventId }
      );

      if (result.records.length === 0) {
        throw new Error('Event not found');
      }

      const props = result.records[0].get('e').properties;
      return {
        ...props,
        metadata: props.metadata ? JSON.parse(props.metadata) : null
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Delete an event
   * @param {string} eventId - The ID of the event
   */
  async deleteEvent(eventId) {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (e:TimelineEvent {eventId: $eventId})
         DETACH DELETE e`,
        { eventId }
      );
    } finally {
      await session.close();
    }
  }
}

module.exports = TimelineEventModel;

