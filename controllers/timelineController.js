/**
 * Timeline Controller
 * Handles all timeline event-related operations for LovedOnes
 */

/**
 * Get all timeline events (global timeline)
 * Supports filtering by eventType, date range, community
 */
async function getAllTimelineEvents(req, res, driver, auditLogger, database) {
  const session = driver.session({ database });
  try {
    const { eventType, startDate, endDate, community, limit } = req.query;
    
    const filters = {};
    if (eventType) filters.eventType = eventType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (community) filters.community = community;
    if (limit) filters.limit = parseInt(limit, 10);

    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver, database);
    const events = await timelineModel.getAllEvents(filters);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.get_all_events',
        resourceType: 'timeline',
        success: true,
        details: { count: events.length, filters }
      });
    }

    res.json({ events });
  } catch (err) {
    console.error('Failed to fetch timeline events:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.get_all_events',
        resourceType: 'timeline',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch timeline events' });
  } finally {
    await session.close();
  }
}

/**
 * Get events grouped by LovedOne (for timeline visualization)
 */
async function getTimelineEventsGrouped(req, res, driver, auditLogger, database) {
  const session = driver.session({ database });
  try {
    const { eventType, startDate, endDate, community } = req.query;
    
    const filters = {};
    if (eventType) filters.eventType = eventType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (community) filters.community = community;

    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver, database);
    const grouped = await timelineModel.getEventsGroupedByLovedOne(filters);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.get_grouped_events',
        resourceType: 'timeline',
        success: true,
        details: { lovedOneCount: grouped.length, filters }
      });
    }

    res.json({ grouped });
  } catch (err) {
    console.error('Failed to fetch grouped timeline events:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.get_grouped_events',
        resourceType: 'timeline',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch grouped timeline events' });
  } finally {
    await session.close();
  }
}

/**
 * Get events for a specific LovedOne
 */
async function getLovedOneTimelineEvents(req, res, driver, auditLogger, database) {
  const { lovedOneId } = req.params;
  const session = driver.session({ database });
  try {
    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver, database);
    const events = await timelineModel.getEventsByLovedOne(lovedOneId);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.get_loved_one_events',
        resourceType: 'timeline',
        resourceId: lovedOneId,
        success: true,
        details: { count: events.length }
      });
    }

    res.json({ events });
  } catch (err) {
    console.error('Failed to fetch LovedOne timeline events:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.get_loved_one_events',
        resourceType: 'timeline',
        resourceId: lovedOneId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch LovedOne timeline events' });
  } finally {
    await session.close();
  }
}

/**
 * Create a new timeline event for a LovedOne
 */
async function createTimelineEvent(req, res, driver, auditLogger, database) {
  const { lovedOneId } = req.params;
  const { eventType, description, timestamp, location, metadata } = req.body;

  if (!eventType || !description) {
    return res.status(400).json({ error: 'eventType and description are required' });
  }

  // Validate eventType against allowed types
  const allowedTypes = [
    'CaseOpened',
    'MissingReported',
    'LastSeen',
    'Sighting',
    'StatusChanged',
    'SearchDispatched',
    'TipReceived',
    'NoteAdded',
    'Found',
    'CaseClosed'
  ];

  if (!allowedTypes.includes(eventType)) {
    return res.status(400).json({ 
      error: `Invalid eventType. Must be one of: ${allowedTypes.join(', ')}` 
    });
  }

  const session = driver.session({ database });
  try {
    // Verify LovedOne exists
    const checkResult = await session.run(
      'MATCH (l:LovedOne {id: $lovedOneId}) RETURN l',
      { lovedOneId }
    );

    if (checkResult.records.length === 0) {
      return res.status(404).json({ error: 'LovedOne not found' });
    }

    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver, database);
    
    const createdBy = req.user?.email || req.user?.preferred_username || req.user?.name || 'system';
    const event = await timelineModel.addEvent(lovedOneId, {
      eventType,
      description,
      timestamp: timestamp || new Date().toISOString(),
      createdBy,
      location,
      metadata
    });

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.create_event',
        resourceType: 'timeline',
        resourceId: lovedOneId,
        success: true,
        details: { eventId: event.eventId, eventType }
      });
    }

    res.status(201).json({ event });
  } catch (err) {
    console.error('Failed to create timeline event:', err);
    console.error('Error details:', {
      lovedOneId,
      eventType,
      description,
      error: err.message,
      stack: err.stack
    });
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.create_event',
        resourceType: 'timeline',
        resourceId: lovedOneId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ 
      error: 'Failed to create timeline event',
      details: err.message 
    });
  } finally {
    await session.close();
  }
}

/**
 * Update an existing timeline event
 */
async function updateTimelineEvent(req, res, driver, auditLogger, database) {
  const { eventId } = req.params;
  const { description, location, metadata } = req.body;

  const session = driver.session({ database });
  try {
    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver, database);
    
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (location !== undefined) updates.location = location;
    if (metadata !== undefined) updates.metadata = metadata;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const event = await timelineModel.updateEvent(eventId, updates);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.update_event',
        resourceType: 'timeline',
        resourceId: eventId,
        success: true,
        details: { updatedFields: Object.keys(updates) }
      });
    }

    res.json({ event });
  } catch (err) {
    console.error('Failed to update timeline event:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.update_event',
        resourceType: 'timeline',
        resourceId: eventId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to update timeline event' });
  } finally {
    await session.close();
  }
}

/**
 * Delete a timeline event
 */
async function deleteTimelineEvent(req, res, driver, auditLogger, database) {
  const { eventId } = req.params;
  const session = driver.session({ database });
  try {
    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver, database);
    
    await timelineModel.deleteEvent(eventId);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.delete_event',
        resourceType: 'timeline',
        resourceId: eventId,
        success: true
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete timeline event:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.delete_event',
        resourceType: 'timeline',
        resourceId: eventId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to delete timeline event' });
  } finally {
    await session.close();
  }
}

/**
 * Backfill CaseOpened events for existing LovedOnes that don't have any events
 * This is a utility function to populate timeline for existing data
 */
async function backfillCaseOpenedEvents(req, res, driver, auditLogger, database) {
  const session = driver.session({ database });
  try {
    // Find all LovedOnes that don't have any timeline events
    const result = await session.run(
      `MATCH (l:LovedOne)
       WHERE NOT EXISTS {
         (l)-[:HAS_TIMELINE_EVENT]->(:TimelineEvent)
       }
       RETURN l`
    );

    const lovedOnesWithoutEvents = result.records.map(r => r.get('l').properties);
    
    if (lovedOnesWithoutEvents.length === 0) {
      return res.json({ 
        message: 'All LovedOnes already have timeline events',
        created: 0 
      });
    }

    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver, database);
    const createdBy = req.user?.email || req.user?.preferred_username || req.user?.name || 'system';
    
    let created = 0;
    for (const lovedOne of lovedOnesWithoutEvents) {
      try {
        await timelineModel.addEvent(lovedOne.id, {
          eventType: 'CaseOpened',
          description: `Case opened for ${lovedOne.name || 'LovedOne'}`,
          timestamp: lovedOne.dateOfIncident || new Date().toISOString(),
          createdBy: 'system-backfill',
          location: lovedOne.community || null
        });
        created++;
      } catch (err) {
        console.error(`Failed to create backfill event for LovedOne ${lovedOne.id}:`, err);
      }
    }

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.backfill_events',
        resourceType: 'timeline',
        success: true,
        details: { created, total: lovedOnesWithoutEvents.length }
      });
    }

    res.json({ 
      message: `Created ${created} CaseOpened events for existing LovedOnes`,
      created,
      total: lovedOnesWithoutEvents.length
    });
  } catch (err) {
    console.error('Failed to backfill timeline events:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'timeline.backfill_events',
        resourceType: 'timeline',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to backfill timeline events' });
  } finally {
    await session.close();
  }
}

module.exports = {
  getAllTimelineEvents,
  getTimelineEventsGrouped,
  getLovedOneTimelineEvents,
  createTimelineEvent,
  updateTimelineEvent,
  deleteTimelineEvent,
  backfillCaseOpenedEvents
};

