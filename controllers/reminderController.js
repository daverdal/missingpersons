/**
 * Reminder Controller
 * Handles all reminder/scheduling operations
 */

/**
 * Get all reminders with optional filters
 */
async function getReminders(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const {
      assignedTo,
      relatedToType,
      relatedToId,
      completed,
      priority,
      startDate,
      endDate,
      overdue
    } = req.query;

    const filters = {};
    if (assignedTo) filters.assignedTo = assignedTo;
    if (relatedToType) filters.relatedToType = relatedToType;
    if (relatedToId) filters.relatedToId = relatedToId;
    if (completed !== undefined) filters.completed = completed === 'true';
    if (priority) filters.priority = priority;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (overdue === 'true') filters.overdue = true;

    const ReminderModel = require('../reminderModel');
    const reminderModel = new ReminderModel(driver);
    const reminders = await reminderModel.getReminders(filters);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.get_all',
        resourceType: 'reminder',
        success: true,
        details: { count: reminders.length, filters }
      });
    }

    res.json({ reminders });
  } catch (err) {
    console.error('Failed to fetch reminders:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.get_all',
        resourceType: 'reminder',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch reminders' });
  } finally {
    await session.close();
  }
}

/**
 * Get upcoming reminders (next 7 days by default)
 */
async function getUpcomingReminders(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const days = parseInt(req.query.days || '7', 10);
    const assignedTo = req.query.assignedTo || null;

    const ReminderModel = require('../reminderModel');
    const reminderModel = new ReminderModel(driver);
    const reminders = await reminderModel.getUpcomingReminders(days, assignedTo);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.get_upcoming',
        resourceType: 'reminder',
        success: true,
        details: { count: reminders.length, days, assignedTo }
      });
    }

    res.json({ reminders });
  } catch (err) {
    console.error('Failed to fetch upcoming reminders:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.get_upcoming',
        resourceType: 'reminder',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch upcoming reminders' });
  } finally {
    await session.close();
  }
}

/**
 * Get reminder by ID
 */
async function getReminderById(req, res, driver, auditLogger) {
  const { reminderId } = req.params;
  const session = driver.session();
  try {
    const ReminderModel = require('../reminderModel');
    const reminderModel = new ReminderModel(driver);
    const reminder = await reminderModel.getReminderById(reminderId);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.get_by_id',
        resourceType: 'reminder',
        resourceId: reminderId,
        success: true
      });
    }

    res.json({ reminder });
  } catch (err) {
    console.error('Failed to fetch reminder:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.get_by_id',
        resourceType: 'reminder',
        resourceId: req.params.reminderId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch reminder' });
  } finally {
    await session.close();
  }
}

/**
 * Create a new reminder
 */
async function createReminder(req, res, driver, auditLogger) {
  const {
    title,
    description,
    dueDate,
    relatedToType,
    relatedToId,
    assignedTo,
    priority,
    reminderType
  } = req.body;

  if (!title || !dueDate) {
    return res.status(400).json({ error: 'Title and due date are required' });
  }

  const session = driver.session();
  try {
    const ReminderModel = require('../reminderModel');
    const reminderModel = new ReminderModel(driver);

    const createdBy = req.user?.email || req.user?.preferred_username || req.user?.name || 'system';
    
    const reminder = await reminderModel.createReminder({
      title,
      description: description || '',
      dueDate,
      createdBy,
      relatedToType: relatedToType || null,
      relatedToId: relatedToId || null,
      assignedTo: assignedTo || null,
      priority: priority || 'medium',
      reminderType: reminderType || 'other',
      completed: false
    });

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.create',
        resourceType: 'reminder',
        resourceId: reminder.reminderId,
        success: true,
        details: { title, dueDate, assignedTo }
      });
    }

    res.status(201).json({ reminder });
  } catch (err) {
    console.error('Failed to create reminder:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.create',
        resourceType: 'reminder',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to create reminder' });
  } finally {
    await session.close();
  }
}

/**
 * Update a reminder
 */
async function updateReminder(req, res, driver, auditLogger) {
  const { reminderId } = req.params;
  const {
    title,
    description,
    dueDate,
    priority,
    completed,
    assignedTo
  } = req.body;

  const session = driver.session();
  try {
    const ReminderModel = require('../reminderModel');
    const reminderModel = new ReminderModel(driver);

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (priority !== undefined) updates.priority = priority;
    if (completed !== undefined) updates.completed = completed;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const reminder = await reminderModel.updateReminder(reminderId, updates);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.update',
        resourceType: 'reminder',
        resourceId: reminderId,
        success: true,
        details: { updatedFields: Object.keys(updates) }
      });
    }

    res.json({ reminder });
  } catch (err) {
    console.error('Failed to update reminder:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.update',
        resourceType: 'reminder',
        resourceId: reminderId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to update reminder' });
  } finally {
    await session.close();
  }
}

/**
 * Delete a reminder
 */
async function deleteReminder(req, res, driver, auditLogger) {
  const { reminderId } = req.params;
  const session = driver.session();
  try {
    const ReminderModel = require('../reminderModel');
    const reminderModel = new ReminderModel(driver);

    await reminderModel.deleteReminder(reminderId);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.delete',
        resourceType: 'reminder',
        resourceId: reminderId,
        success: true
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete reminder:', err);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reminder.delete',
        resourceType: 'reminder',
        resourceId: reminderId,
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to delete reminder' });
  } finally {
    await session.close();
  }
}

module.exports = {
  getReminders,
  getUpcomingReminders,
  getReminderById,
  createReminder,
  updateReminder,
  deleteReminder
};

