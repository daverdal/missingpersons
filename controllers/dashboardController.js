/**
 * Dashboard Controller
 * Handles dashboard statistics and activity feed
 */

/**
 * Get dashboard statistics
 * Returns counts for cases, loved ones, reminders, and recent activity
 */
async function getDashboardStats(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const userEmail = req.user?.email || req.user?.preferred_username || null;

    // Get case statistics
    const caseStats = await session.run(`
      MATCH (a:Applicant)
      RETURN 
        count(a) as totalCases,
        sum(CASE WHEN a.status = 'Active' THEN 1 ELSE 0 END) as activeCases,
        sum(CASE WHEN a.status = 'Closed' THEN 1 ELSE 0 END) as closedCases,
        sum(CASE WHEN a.status = 'Follow-up Required' THEN 1 ELSE 0 END) as followupRequired,
        sum(CASE WHEN a.status = 'On Hold' THEN 1 ELSE 0 END) as onHold
    `);
    const caseData = caseStats.records[0];
    const casesByStatus = {
      total: caseData.get('totalCases')?.toNumber() || 0,
      active: caseData.get('activeCases')?.toNumber() || 0,
      closed: caseData.get('closedCases')?.toNumber() || 0,
      followupRequired: caseData.get('followupRequired')?.toNumber() || 0,
      onHold: caseData.get('onHold')?.toNumber() || 0
    };

    // Get user's assigned cases if logged in
    let myCases = 0;
    if (userEmail) {
      const myCasesResult = await session.run(`
        MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant)
        RETURN count(a) as count
      `, { email: userEmail });
      myCases = myCasesResult.records[0]?.get('count')?.toNumber() || 0;
    }

    // Get LovedOne statistics
    const lovedOneStats = await session.run(`
      MATCH (l:LovedOne)
      RETURN count(l) as totalLovedOnes
    `);
    const totalLovedOnes = lovedOneStats.records[0]?.get('totalLovedOnes')?.toNumber() || 0;

    // Get reminder statistics
    const now = new Date().toISOString();
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const reminderStats = await session.run(`
      MATCH (r:Reminder)
      WHERE r.completed = false
      WITH r, 
           CASE WHEN r.dueDate < $now THEN 1 ELSE 0 END as isOverdue,
           CASE WHEN r.dueDate >= $now AND r.dueDate <= $weekFromNow THEN 1 ELSE 0 END as isUpcoming
      RETURN 
        count(r) as totalActive,
        sum(isOverdue) as overdue,
        sum(isUpcoming) as upcoming
    `, { now, weekFromNow });
    const reminderData = reminderStats.records[0];
    const reminders = {
      totalActive: reminderData.get('totalActive')?.toNumber() || 0,
      overdue: reminderData.get('overdue')?.toNumber() || 0,
      upcoming: reminderData.get('upcoming')?.toNumber() || 0
    };

    // Get recent timeline events (last 10)
    const TimelineEventModel = require('../timelineEventModel');
    const timelineModel = new TimelineEventModel(driver);
    const recentEvents = await timelineModel.getAllEvents({ limit: parseInt('10', 10) });
    
    // Sort by timestamp descending (newest first)
    recentEvents.sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return dateB - dateA;
    });

    // Get recent reminders (next 5 due soon)
    const upcomingRemindersResult = await session.run(`
      MATCH (r:Reminder)
      WHERE r.completed = false AND r.dueDate >= $now
      OPTIONAL MATCH (r)-[:RELATED_TO]->(a:Applicant)
      OPTIONAL MATCH (r)-[:RELATED_TO]->(l:LovedOne)
      RETURN r, a, l
      ORDER BY r.dueDate ASC
      LIMIT 5
    `, { now });
    
    const upcomingReminders = upcomingRemindersResult.records.map(r => {
      const reminder = r.get('r').properties;
      const applicant = r.get('a');
      const lovedOne = r.get('l');
      return {
        ...reminder,
        relatedTo: applicant ? { type: 'case', name: applicant.properties.name, id: applicant.properties.id } :
                 lovedOne ? { type: 'lovedOne', name: lovedOne.properties.name, id: lovedOne.properties.id } :
                 null
      };
    });

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'dashboard.get_stats',
        resourceType: 'dashboard',
        success: true
      });
    }

    res.json({
      cases: casesByStatus,
      myCases,
      lovedOnes: { total: totalLovedOnes },
      reminders,
      recentEvents: recentEvents.slice(0, 10),
      upcomingReminders
    });
  } catch (err) {
    console.error('Failed to fetch dashboard stats:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'dashboard.get_stats',
        resourceType: 'dashboard',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  } finally {
    await session.close();
  }
}

module.exports = {
  getDashboardStats
};

