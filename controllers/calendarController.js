/**
 * Calendar Controller
 * Handles calendar-related operations, aggregating events from reminders, timeline events, and appointments
 */

/**
 * Get all calendar events for a date range
 * Aggregates reminders, timeline events, and appointments
 */
async function getCalendarEvents(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { start, end, assignedTo, relatedToId, eventTypes } = req.query;
    
    // Parse event types filter (comma-separated: "reminders,timeline,appointments")
    const includeTypes = eventTypes ? eventTypes.split(',') : ['reminders', 'timeline'];
    
    const userEmail = req.user?.email || req.user?.preferred_username;
    const calendarEvents = [];

    // 1. Get Reminders
    if (includeTypes.includes('reminders')) {
      const ReminderModel = require('../reminderModel');
      const reminderModel = new ReminderModel(driver);
      
      const reminderFilters = {
        startDate: start,
        endDate: end
      };
      
      if (assignedTo) {
        reminderFilters.assignedTo = assignedTo;
      } else if (assignedTo === undefined) {
        // If no filter, show all reminders (not just user's)
        // But we can filter by user if needed
      }
      
      if (relatedToId) {
        reminderFilters.relatedToId = relatedToId;
      }
      
      const reminders = await reminderModel.getReminders(reminderFilters);
      
      reminders.forEach(reminder => {
        calendarEvents.push({
          id: `reminder-${reminder.reminderId}`,
          title: reminder.title,
          start: reminder.dueDate,
          end: reminder.dueDate, // Reminders are single-point events
          allDay: false,
          type: 'reminder',
          color: getReminderColor(reminder.priority, reminder.completed),
          textColor: '#fff',
          extendedProps: {
            reminderId: reminder.reminderId,
            priority: reminder.priority,
            completed: reminder.completed,
            assignedTo: reminder.assignedTo,
            relatedToType: reminder.relatedToType,
            relatedToId: reminder.relatedToId,
            description: reminder.description,
            overdue: new Date(reminder.dueDate) < new Date() && !reminder.completed
          }
        });
      });
    }

    // 2. Get Timeline Events (important ones only)
    if (includeTypes.includes('timeline')) {
      const TimelineEventModel = require('../timelineEventModel');
      const timelineModel = new TimelineEventModel(driver);
      
      const timelineFilters = {
        startDate: start,
        endDate: end
      };
      
      if (relatedToId) {
        // For timeline, we'd need to filter by lovedOneId
        // This is a simplified version - you might want to enhance this
      }
      
      const timelineEvents = await timelineModel.getAllEvents(timelineFilters);
      
      // Filter to only show important event types on calendar
      const importantEventTypes = [
        'Sighting',
        'TipReceived',
        'StatusChanged',
        'SearchDispatched',
        'Found',
        'CaseClosed',
        'CourtDate',
        'Meeting'
      ];
      
      timelineEvents.forEach(event => {
        if (importantEventTypes.includes(event.eventType)) {
          calendarEvents.push({
            id: `timeline-${event.eventId}`,
            title: `${event.lovedOneName || 'Unknown'}: ${event.eventType}`,
            start: event.timestamp,
            end: event.timestamp,
            allDay: false,
            type: 'timeline',
            color: getTimelineEventColor(event.eventType),
            textColor: '#fff',
            extendedProps: {
              eventId: event.eventId,
              eventType: event.eventType,
              lovedOneId: event.lovedOneId,
              lovedOneName: event.lovedOneName,
              description: event.description,
              location: event.location
            }
          });
        }
      });
    }

    // 3. Get Appointments (if we add this feature later)
    // For now, we'll leave this as a placeholder

    // Sort events by start date
    calendarEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'calendar.get_events',
        resourceType: 'calendar',
        success: true,
        details: { 
          count: calendarEvents.length, 
          start, 
          end,
          includeTypes 
        }
      });
    }

    res.json({ events: calendarEvents });
  } catch (err) {
    console.error('Failed to fetch calendar events:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'calendar.get_events',
        resourceType: 'calendar',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch calendar events', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get color for reminder based on priority and completion status
 */
function getReminderColor(priority, completed) {
  if (completed) return '#95a5a6'; // Gray for completed
  
  const colors = {
    urgent: '#ff6b6b',   // Red
    high: '#ffa500',      // Orange
    medium: '#6fcf6f',   // Green
    low: '#95a5a6'        // Gray
  };
  
  return colors[priority] || '#6fcf6f';
}

/**
 * Get color for timeline event based on event type
 */
function getTimelineEventColor(eventType) {
  const colors = {
    'Sighting': '#6fcf6f',        // Green
    'TipReceived': '#ffa500',      // Orange
    'StatusChanged': '#3498db',    // Blue
    'SearchDispatched': '#9b59b6', // Purple
    'Found': '#2ecc71',            // Bright green
    'CaseClosed': '#95a5a6',       // Gray
    'CourtDate': '#e74c3c',        // Red
    'Meeting': '#3498db'           // Blue
  };
  
  return colors[eventType] || '#95a5a6';
}

module.exports = {
  getCalendarEvents
};

