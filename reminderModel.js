// reminderModel.js
// Model and Neo4j queries for reminders/scheduling

const { v4: uuidv4 } = require('uuid');

class ReminderModel {
  constructor(driver, database = 'neo4j') {
    this.driver = driver;
    this.database = database;
  }

  /**
   * Create a new reminder
   * @param {object} reminder - Reminder data
   * @param {string} reminder.title - Title of the reminder
   * @param {string} reminder.description - Description/details
   * @param {string} reminder.dueDate - ISO timestamp when reminder is due
   * @param {string} reminder.createdBy - User who created it
   * @param {string} [reminder.relatedToType] - 'case', 'lovedOne', or null
   * @param {string} [reminder.relatedToId] - ID of related case or LovedOne
   * @param {string} [reminder.assignedTo] - Email of user assigned to this reminder
   * @param {string} [reminder.priority] - 'low', 'medium', 'high', 'urgent'
   * @param {boolean} [reminder.completed] - Whether reminder is completed
   * @param {string} [reminder.reminderType] - 'followup', 'court', 'checkin', 'anniversary', 'other'
   */
  async createReminder(reminder) {
    const session = this.driver.session({ database: this.database });
    try {
      const reminderId = uuidv4();
      const params = {
        reminderId,
        title: reminder.title || '',
        description: reminder.description || '',
        dueDate: reminder.dueDate,
        createdBy: reminder.createdBy || 'system',
        relatedToType: reminder.relatedToType || null,
        relatedToId: reminder.relatedToId || null,
        assignedTo: reminder.assignedTo || null,
        priority: reminder.priority || 'medium',
        completed: reminder.completed || false,
        reminderType: reminder.reminderType || 'other',
        createdAt: new Date().toISOString()
      };

      await session.run(
        `CREATE (r:Reminder {
          reminderId: $reminderId,
          title: $title,
          description: $description,
          dueDate: $dueDate,
          createdBy: $createdBy,
          relatedToType: $relatedToType,
          relatedToId: $relatedToId,
          assignedTo: $assignedTo,
          priority: $priority,
          completed: $completed,
          reminderType: $reminderType,
          createdAt: $createdAt
        })
        RETURN r`,
        params
      );

      // Link to case if provided
      if (reminder.relatedToType === 'case' && reminder.relatedToId) {
        await session.run(
          `MATCH (r:Reminder {reminderId: $reminderId}), (a:Applicant {id: $caseId})
           CREATE (a)-[:HAS_REMINDER]->(r)`,
          { reminderId, caseId: reminder.relatedToId }
        );
      }

      // Link to LovedOne if provided
      if (reminder.relatedToType === 'lovedOne' && reminder.relatedToId) {
        await session.run(
          `MATCH (r:Reminder {reminderId: $reminderId}), (l:LovedOne {id: $lovedOneId})
           CREATE (l)-[:HAS_REMINDER]->(r)`,
          { reminderId, lovedOneId: reminder.relatedToId }
        );
      }

      // Link to assigned user if provided
      if (reminder.assignedTo) {
        await session.run(
          `MATCH (r:Reminder {reminderId: $reminderId}), (u:User {email: $email})
           CREATE (r)-[:ASSIGNED_TO]->(u)`,
          { reminderId, email: reminder.assignedTo }
        );
      }

      return {
        reminderId: params.reminderId,
        ...params
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get all reminders with optional filters
   * @param {object} filters - Filter options
   * @param {string} [filters.assignedTo] - Filter by assigned user email
   * @param {string} [filters.relatedToType] - Filter by related type
   * @param {string} [filters.relatedToId] - Filter by related ID
   * @param {boolean} [filters.completed] - Filter by completion status
   * @param {string} [filters.priority] - Filter by priority
   * @param {string} [filters.startDate] - Start date for due date range
   * @param {string} [filters.endDate] - End date for due date range
   * @param {boolean} [filters.overdue] - Show only overdue reminders
   */
  async getReminders(filters = {}) {
    const session = this.driver.session({ database: this.database });
    try {
      let query = `MATCH (r:Reminder) WHERE 1=1`;
      const params = {};

      if (filters.assignedTo) {
        query += ` AND r.assignedTo = $assignedTo`;
        params.assignedTo = filters.assignedTo;
      }

      if (filters.relatedToType) {
        query += ` AND r.relatedToType = $relatedToType`;
        params.relatedToType = filters.relatedToType;
      }

      if (filters.relatedToId) {
        query += ` AND r.relatedToId = $relatedToId`;
        params.relatedToId = filters.relatedToId;
      }

      if (filters.completed !== undefined) {
        query += ` AND r.completed = $completed`;
        params.completed = filters.completed;
      }

      if (filters.priority) {
        query += ` AND r.priority = $priority`;
        params.priority = filters.priority;
      }

      if (filters.startDate) {
        query += ` AND r.dueDate >= $startDate`;
        params.startDate = filters.startDate;
      }

      if (filters.endDate) {
        query += ` AND r.dueDate <= $endDate`;
        params.endDate = filters.endDate;
      }

      if (filters.overdue) {
        const now = new Date().toISOString();
        query += ` AND r.dueDate < $now AND r.completed = false`;
        params.now = now;
      }

      query += ` RETURN r ORDER BY r.dueDate ASC`;

      const result = await session.run(query, params);
      return result.records.map(r => r.get('r').properties);
    } finally {
      await session.close();
    }
  }

  /**
   * Get reminder by ID
   * @param {string} reminderId - The reminder ID
   */
  async getReminderById(reminderId) {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (r:Reminder {reminderId: $reminderId})
         RETURN r`,
        { reminderId }
      );

      if (result.records.length === 0) {
        return null;
      }

      return result.records[0].get('r').properties;
    } finally {
      await session.close();
    }
  }

  /**
   * Update a reminder
   * @param {string} reminderId - The reminder ID
   * @param {object} updates - Fields to update
   */
  async updateReminder(reminderId, updates) {
    const session = this.driver.session({ database: this.database });
    try {
      const setClauses = [];
      const params = { reminderId };

      if (updates.title !== undefined) {
        setClauses.push('r.title = $title');
        params.title = updates.title;
      }

      if (updates.description !== undefined) {
        setClauses.push('r.description = $description');
        params.description = updates.description;
      }

      if (updates.dueDate !== undefined) {
        setClauses.push('r.dueDate = $dueDate');
        params.dueDate = updates.dueDate;
      }

      if (updates.priority !== undefined) {
        setClauses.push('r.priority = $priority');
        params.priority = updates.priority;
      }

      if (updates.completed !== undefined) {
        setClauses.push('r.completed = $completed');
        params.completed = updates.completed;
      }

      if (updates.assignedTo !== undefined) {
        setClauses.push('r.assignedTo = $assignedTo');
        params.assignedTo = updates.assignedTo;

        // Update relationship
        await session.run(
          `MATCH (r:Reminder {reminderId: $reminderId})-[rel:ASSIGNED_TO]->(:User)
           DELETE rel`,
          { reminderId }
        );

        if (updates.assignedTo) {
          await session.run(
            `MATCH (r:Reminder {reminderId: $reminderId}), (u:User {email: $email})
             CREATE (r)-[:ASSIGNED_TO]->(u)`,
            { reminderId, email: updates.assignedTo }
          );
        }
      }

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      await session.run(
        `MATCH (r:Reminder {reminderId: $reminderId})
         SET ${setClauses.join(', ')}`,
        params
      );

      // Return updated reminder
      return await this.getReminderById(reminderId);
    } finally {
      await session.close();
    }
  }

  /**
   * Delete a reminder
   * @param {string} reminderId - The reminder ID
   */
  async deleteReminder(reminderId) {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `MATCH (r:Reminder {reminderId: $reminderId})
         DETACH DELETE r`,
        { reminderId }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Get upcoming reminders (due in next N days)
   * @param {number} days - Number of days ahead to look
   * @param {string} [assignedTo] - Optional user email filter
   */
  async getUpcomingReminders(days = 7, assignedTo = null) {
    const session = this.driver.session({ database: this.database });
    try {
      const now = new Date().toISOString();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      const futureDateISO = futureDate.toISOString();

      let query = `
        MATCH (r:Reminder)
        WHERE r.dueDate >= $now 
          AND r.dueDate <= $futureDate
          AND r.completed = false
      `;
      const params = { now, futureDate: futureDateISO };

      if (assignedTo) {
        query += ` AND r.assignedTo = $assignedTo`;
        params.assignedTo = assignedTo;
      }

      query += ` RETURN r ORDER BY r.dueDate ASC`;

      const result = await session.run(query, params);
      return result.records.map(r => r.get('r').properties);
    } finally {
      await session.close();
    }
  }
}

module.exports = ReminderModel;

