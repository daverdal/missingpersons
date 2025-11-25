/**
 * Reports Controller
 * Handles report generation (admin only)
 */

/**
 * Get Case Statistics Report
 * Returns comprehensive case statistics
 */
async function getCaseStatisticsReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { startDate, endDate } = req.query;

    // Build date filter if provided
    let dateFilter = '';
    const params = {};
    if (startDate && endDate) {
      dateFilter = 'WHERE a.createdAt >= $startDate AND a.createdAt <= $endDate';
      params.startDate = startDate;
      params.endDate = endDate;
    }

    // Get overall case statistics
    const caseStats = await session.run(`
      MATCH (a:Applicant)
      ${dateFilter}
      RETURN 
        count(a) as totalCases,
        sum(CASE WHEN a.status = 'Active' THEN 1 ELSE 0 END) as activeCases,
        sum(CASE WHEN a.status = 'Closed' THEN 1 ELSE 0 END) as closedCases,
        sum(CASE WHEN a.status = 'Follow-up Required' THEN 1 ELSE 0 END) as followupRequired,
        sum(CASE WHEN a.status = 'On Hold' THEN 1 ELSE 0 END) as onHold
    `, params);
    const caseData = caseStats.records[0];
    
    // Get cases by status breakdown
    const casesByStatusResult = await session.run(`
      MATCH (a:Applicant)
      ${dateFilter}
      RETURN a.status as status, count(a) as count
      ORDER BY count DESC
    `, params);
    const casesByStatus = casesByStatusResult.records.map(r => ({
      status: r.get('status') || 'Unknown',
      count: r.get('count').toNumber()
    }));

    // Get cases by month (for trends)
    const casesByMonthResult = await session.run(`
      MATCH (a:Applicant)
      ${dateFilter}
      WITH a, substring(a.createdAt, 0, 7) as month
      RETURN month, count(a) as count
      ORDER BY month DESC
      LIMIT 12
    `, params);
    const casesByMonth = casesByMonthResult.records.map(r => ({
      month: r.get('month'),
      count: r.get('count').toNumber()
    }));

    // Get missing persons statistics
    let lovedOneDateFilter = '';
    if (startDate && endDate) {
      lovedOneDateFilter = 'WHERE l.createdAt >= $startDate AND l.createdAt <= $endDate';
    }
    const lovedOneStats = await session.run(`
      MATCH (l:LovedOne)
      ${lovedOneDateFilter}
      RETURN count(l) as totalLovedOnes
    `, params);
    const totalLovedOnes = lovedOneStats.records[0]?.get('totalLovedOnes')?.toNumber() || 0;

    // Get reminder statistics
    let reminderDateFilter = '';
    if (startDate && endDate) {
      reminderDateFilter = 'WHERE r.createdAt >= $startDate AND r.createdAt <= $endDate';
    }
    const reminderStats = await session.run(`
      MATCH (r:Reminder)
      ${reminderDateFilter}
      RETURN 
        count(r) as totalReminders,
        sum(CASE WHEN r.completed = true THEN 1 ELSE 0 END) as completedReminders,
        sum(CASE WHEN r.completed = false AND r.dueDate < datetime() THEN 1 ELSE 0 END) as overdueReminders
    `, params);
    const reminderData = reminderStats.records[0];

    // Get timeline event statistics
    let timelineDateFilter = '';
    if (startDate && endDate) {
      timelineDateFilter = 'WHERE e.timestamp >= $startDate AND e.timestamp <= $endDate';
    }
    const timelineStats = await session.run(`
      MATCH (e:TimelineEvent)
      ${timelineDateFilter}
      RETURN count(e) as totalEvents
    `, params);
    const totalEvents = timelineStats.records[0]?.get('totalEvents')?.toNumber() || 0;

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.case_statistics',
        resourceType: 'report',
        success: true,
        details: { startDate, endDate }
      });
    }

    res.json({
      report: {
        type: 'Case Statistics',
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        statistics: {
          cases: {
            total: caseData.get('totalCases')?.toNumber() || 0,
            active: caseData.get('activeCases')?.toNumber() || 0,
            closed: caseData.get('closedCases')?.toNumber() || 0,
            followupRequired: caseData.get('followupRequired')?.toNumber() || 0,
            onHold: caseData.get('onHold')?.toNumber() || 0,
            byStatus: casesByStatus
          },
          missingPersons: {
            total: totalLovedOnes
          },
          reminders: {
            total: reminderData.get('totalReminders')?.toNumber() || 0,
            completed: reminderData.get('completedReminders')?.toNumber() || 0,
            overdue: reminderData.get('overdueReminders')?.toNumber() || 0
          },
          timelineEvents: {
            total: totalEvents
          },
          trends: {
            casesByMonth: casesByMonth
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to generate case statistics report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.case_statistics',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate case statistics report', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Caseworker Activity Report
 * Returns activity metrics for each caseworker
 */
async function getCaseworkerActivityReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = '';
    const params = {};
    if (startDate && endDate) {
      dateFilter = 'AND r.createdAt >= $startDate AND r.createdAt <= $endDate';
      params.startDate = startDate;
      params.endDate = endDate;
    }

    // Get all caseworkers
    const usersResult = await session.run(`
      MATCH (u:User)
      WHERE u.roles CONTAINS 'case_worker' OR u.roles CONTAINS 'admin'
      RETURN u.email as email, u.name as name
      ORDER BY u.name
    `);
    const caseworkers = usersResult.records.map(r => ({
      email: r.get('email'),
      name: r.get('name') || r.get('email')
    }));

    // Get activity for each caseworker
    const activityReport = await Promise.all(caseworkers.map(async (cw) => {
      const email = cw.email;

      // Cases assigned
      let caseDateFilter = '';
      if (startDate && endDate) {
        caseDateFilter = 'AND a.createdAt >= $startDate AND a.createdAt <= $endDate';
      }
      const casesResult = await session.run(`
        MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant)
        WHERE 1=1 ${caseDateFilter}
        RETURN count(a) as totalCases,
               sum(CASE WHEN a.status = 'Active' THEN 1 ELSE 0 END) as activeCases,
               sum(CASE WHEN a.status = 'Closed' THEN 1 ELSE 0 END) as closedCases
      `, { email, ...params });
      const casesData = casesResult.records[0];

      // Reminders
      const remindersResult = await session.run(`
        MATCH (r:Reminder)
        WHERE r.assignedTo = $email ${dateFilter}
        RETURN 
          count(r) as totalReminders,
          sum(CASE WHEN r.completed = true THEN 1 ELSE 0 END) as completedReminders,
          sum(CASE WHEN r.completed = false AND r.dueDate < datetime() THEN 1 ELSE 0 END) as overdueReminders
      `, { email, ...params });
      const remindersData = remindersResult.records[0];

      // Timeline events created
      let eventDateFilter = '';
      if (startDate && endDate) {
        eventDateFilter = 'AND e.timestamp >= $startDate AND e.timestamp <= $endDate';
      }
      const eventsResult = await session.run(`
        MATCH (e:TimelineEvent)
        WHERE e.createdBy = $email ${eventDateFilter}
        RETURN count(e) as totalEvents
      `, { email, ...params });
      const eventsData = eventsResult.records[0];

      // Witnesses reported to this caseworker
      let witnessDateFilter = '';
      if (startDate && endDate) {
        witnessDateFilter = 'AND w.createdAt >= $startDate AND w.createdAt <= $endDate';
      }
      const witnessesResult = await session.run(`
        MATCH (w:Witness)
        WHERE w.reportedTo = $email ${witnessDateFilter}
        RETURN count(w) as totalWitnesses
      `, { email, ...params });
      const witnessesData = witnessesResult.records[0];

      return {
        caseworker: cw.name,
        email: email,
        cases: {
          total: casesData.get('totalCases')?.toNumber() || 0,
          active: casesData.get('activeCases')?.toNumber() || 0,
          closed: casesData.get('closedCases')?.toNumber() || 0
        },
        reminders: {
          total: remindersData.get('totalReminders')?.toNumber() || 0,
          completed: remindersData.get('completedReminders')?.toNumber() || 0,
          overdue: remindersData.get('overdueReminders')?.toNumber() || 0,
          completionRate: remindersData.get('totalReminders')?.toNumber() > 0
            ? ((remindersData.get('completedReminders')?.toNumber() || 0) / remindersData.get('totalReminders')?.toNumber() * 100).toFixed(1)
            : '0.0'
        },
        timelineEvents: {
          total: eventsData.get('totalEvents')?.toNumber() || 0
        },
        witnesses: {
          total: witnessesData.get('totalWitnesses')?.toNumber() || 0
        }
      };
    }));

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.caseworker_activity',
        resourceType: 'report',
        success: true,
        details: { startDate, endDate }
      });
    }

    res.json({
      report: {
        type: 'Caseworker Activity',
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        caseworkers: activityReport
      }
    });
  } catch (err) {
    console.error('Failed to generate caseworker activity report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.caseworker_activity',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate caseworker activity report', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Case Detail Export
 * Returns detailed information for one or more cases
 */
async function getCaseDetailExport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { caseIds, startDate, endDate, status } = req.query;

    let query = `
      MATCH (a:Applicant)
      WHERE 1=1
    `;
    const params = {};

    // Filter by case IDs if provided
    if (caseIds) {
      const ids = Array.isArray(caseIds) ? caseIds : caseIds.split(',');
      query += ` AND a.id IN $caseIds`;
      params.caseIds = ids;
    }

    // Filter by date range
    if (startDate && endDate) {
      query += ` AND a.createdAt >= $startDate AND a.createdAt <= $endDate`;
      params.startDate = startDate;
      params.endDate = endDate;
    }

    // Filter by status
    if (status) {
      query += ` AND a.status = $status`;
      params.status = status;
    }

    query += `
      OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
      OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
      OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
      OPTIONAL MATCH (a)-[:LOCATED_IN]->(comm:Community)
      RETURN a, o, 
             collect(DISTINCT {lovedOne: l, relationship: rel.relationship}) AS lovedOnes,
             collect(DISTINCT u.email) AS assignedTo,
             comm
      ORDER BY a.createdAt DESC
    `;

    const result = await session.run(query, params);
    
    // Get detailed information for each case
    const caseDetails = await Promise.all(result.records.map(async (record) => {
      const applicant = record.get('a').properties;
      const caseId = applicant.id;

      // Get reminders
      const remindersResult = await session.run(`
        MATCH (r:Reminder)
        WHERE r.relatedToType = 'case' AND r.relatedToId = $caseId
        RETURN r
        ORDER BY r.dueDate DESC
      `, { caseId });
      const reminders = remindersResult.records.map(r => r.get('r').properties);

      // Get timeline events for loved ones in this case
      const timelineEventsResult = await session.run(`
        MATCH (a:Applicant {id: $caseId})-[:RELATED_TO]->(l:LovedOne)-[:HAS_TIMELINE_EVENT]->(e:TimelineEvent)
        RETURN e, l
        ORDER BY e.timestamp DESC
      `, { caseId });
      const timelineEvents = timelineEventsResult.records.map(r => {
        const event = r.get('e').properties;
        const lovedOne = r.get('l').properties;
        return {
          ...event,
          lovedOneName: lovedOne.name,
          lovedOneId: lovedOne.id
        };
      });

      // Get witnesses
      const witnessesResult = await session.run(`
        MATCH (w:Witness)
        WHERE w.relatedToType = 'case' AND w.relatedToId = $caseId
        RETURN w
        ORDER BY w.createdAt DESC
      `, { caseId });
      const witnesses = witnessesResult.records.map(r => r.get('w').properties);

      const orgNode = record.get('o');
      const lovedOnesRaw = record.get('lovedOnes');
      const lovedOnes = lovedOnesRaw
        .filter(lo => lo && lo.lovedOne)
        .map(lo => ({
          ...lo.lovedOne.properties,
          relationship: lo.relationship || ''
        }));
      const commNode = record.get('comm');

      return {
        case: {
          ...applicant,
          referringOrg: orgNode ? orgNode.properties : null,
          community: commNode ? commNode.properties : null,
          assignedTo: record.get('assignedTo').filter(e => !!e)
        },
        lovedOnes,
        reminders,
        timelineEvents,
        witnesses
      };
    }));

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.case_detail_export',
        resourceType: 'report',
        success: true,
        details: { caseIds, startDate, endDate, status }
      });
    }

    res.json({
      report: {
        type: 'Case Detail Export',
        generatedAt: new Date().toISOString(),
        filters: { caseIds, startDate, endDate, status },
        cases: caseDetails
      }
    });
  } catch (err) {
    console.error('Failed to generate case detail export:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.case_detail_export',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate case detail export', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Community Report
 * Returns comprehensive report for a specific First Nation community/reserve
 */
async function getCommunityReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { community } = req.query;

    if (!community || !community.trim()) {
      return res.status(400).json({ error: 'Community name is required' });
    }

    const communityName = community.trim();

    // Get all cases for this community (via LOCATED_IN relationship)
    const casesResult = await session.run(`
      MATCH (comm:Community {name: $communityName})<-[:LOCATED_IN]-(a:Applicant)
      OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
      OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
      OPTIONAL MATCH (u:User)-[:ASSIGNED_TO]->(a)
      RETURN a, o, 
             collect(DISTINCT {lovedOne: l, relationship: rel.relationship}) AS lovedOnes,
             collect(DISTINCT u.email) AS assignedTo
      ORDER BY a.createdAt DESC
    `, { communityName });

    const cases = casesResult.records.map(r => {
      const a = r.get('a').properties;
      const orgNode = r.get('o');
      const lovedOnesRaw = r.get('lovedOnes');
      const lovedOnes = lovedOnesRaw
        .filter(lo => lo && lo.lovedOne)
        .map(lo => ({
          ...lo.lovedOne.properties,
          relationship: lo.relationship || ''
        }));
      return {
        ...a,
        referringOrg: orgNode ? orgNode.properties : null,
        lovedOnes,
        assignedTo: r.get('assignedTo').filter(e => !!e)
      };
    });

    // Get all loved ones with this community property
    const lovedOnesResult = await session.run(`
      MATCH (l:LovedOne {community: $communityName})
      OPTIONAL MATCH (a:Applicant)-[rel:RELATED_TO]->(l)
      RETURN l, collect(DISTINCT {applicant: a, relationship: rel.relationship}) AS relatedCases
      ORDER BY l.name
    `, { communityName });

    const lovedOnes = lovedOnesResult.records.map(r => {
      const l = r.get('l').properties;
      const relatedCasesRaw = r.get('relatedCases');
      const relatedCases = relatedCasesRaw
        .filter(rc => rc && rc.applicant)
        .map(rc => ({
          ...rc.applicant.properties,
          relationship: rc.relationship || ''
        }));
      return {
        ...l,
        relatedCases
      };
    });

    // Get detailed information for each case
    const caseDetails = await Promise.all(cases.map(async (caseItem) => {
      const caseId = caseItem.id;

      // Get case notes
      const notesResult = await session.run(`
        MATCH (a:Applicant {id: $caseId})-[:HAS_NOTE]->(n:Note)
        RETURN n
        ORDER BY n.timestamp DESC
      `, { caseId });
      const notes = notesResult.records.map(r => r.get('n').properties);

      // Get case events
      const eventsResult = await session.run(`
        MATCH (a:Applicant {id: $caseId})-[:HAS_EVENT]->(e:CaseEvent)
        RETURN e
        ORDER BY e.timestamp DESC
      `, { caseId });
      const events = eventsResult.records.map(r => r.get('e').properties);

      // Get reminders
      const remindersResult = await session.run(`
        MATCH (r:Reminder)
        WHERE r.relatedToType = 'case' AND r.relatedToId = $caseId
        RETURN r
        ORDER BY r.dueDate DESC
      `, { caseId });
      const reminders = remindersResult.records.map(r => r.get('r').properties);

      // Get witnesses
      const witnessesResult = await session.run(`
        MATCH (w:Witness)
        WHERE w.relatedToType = 'case' AND w.relatedToId = $caseId
        RETURN w
        ORDER BY w.createdAt DESC
      `, { caseId });
      const witnesses = witnessesResult.records.map(r => r.get('w').properties);

      // Get timeline events for loved ones in this case
      const timelineEventsResult = await session.run(`
        MATCH (a:Applicant {id: $caseId})-[:RELATED_TO]->(l:LovedOne)-[:HAS_TIMELINE_EVENT]->(e:TimelineEvent)
        RETURN e, l
        ORDER BY e.timestamp DESC
      `, { caseId });
      const timelineEvents = timelineEventsResult.records.map(r => {
        const event = r.get('e').properties;
        const lovedOne = r.get('l').properties;
        return {
          ...event,
          lovedOneName: lovedOne.name,
          lovedOneId: lovedOne.id
        };
      });

      return {
        case: caseItem,
        notes,
        events,
        reminders,
        witnesses,
        timelineEvents
      };
    }));

    // Get timeline events for loved ones (even if not in a case)
    const allTimelineEventsResult = await session.run(`
      MATCH (l:LovedOne {community: $communityName})-[:HAS_TIMELINE_EVENT]->(e:TimelineEvent)
      RETURN e, l
      ORDER BY e.timestamp DESC
    `, { communityName });
    const allTimelineEvents = allTimelineEventsResult.records.map(r => {
      const event = r.get('e').properties;
      const lovedOne = r.get('l').properties;
      return {
        ...event,
        lovedOneName: lovedOne.name,
        lovedOneId: lovedOne.id
      };
    });

    // Get witnesses for loved ones in this community
    const lovedOneIds = lovedOnes.map(lo => lo.id).filter(id => id);
    let communityWitnesses = [];
    if (lovedOneIds.length > 0) {
      const communityWitnessesResult = await session.run(`
        MATCH (w:Witness)
        WHERE w.relatedToType = 'lovedOne' AND w.relatedToId IN $lovedOneIds
        RETURN w
        ORDER BY w.createdAt DESC
      `, { lovedOneIds });
      communityWitnesses = communityWitnessesResult.records.map(r => r.get('w').properties);
    }

    // Get reminders for loved ones in this community
    let communityReminders = [];
    if (lovedOneIds.length > 0) {
      const communityRemindersResult = await session.run(`
        MATCH (r:Reminder)
        WHERE r.relatedToType = 'lovedOne' AND r.relatedToId IN $lovedOneIds
        RETURN r
        ORDER BY r.dueDate DESC
      `, { lovedOneIds });
      communityReminders = communityRemindersResult.records.map(r => r.get('r').properties);
    }

    // Summary statistics
    const summary = {
      totalCases: cases.length,
      activeCases: cases.filter(c => c.status === 'Active').length,
      totalLovedOnes: lovedOnes.length,
      activeLovedOnes: lovedOnes.filter(lo => lo.status && lo.status !== 'Found Safe' && lo.status !== 'Found Deceased' && lo.status !== 'Case Closed').length,
      totalNotes: caseDetails.reduce((sum, cd) => sum + cd.notes.length, 0),
      totalEvents: caseDetails.reduce((sum, cd) => sum + cd.events.length, 0),
      totalReminders: caseDetails.reduce((sum, cd) => sum + cd.reminders.length, 0) + communityReminders.length,
      totalWitnesses: caseDetails.reduce((sum, cd) => sum + cd.witnesses.length, 0) + communityWitnesses.length,
      totalTimelineEvents: caseDetails.reduce((sum, cd) => sum + cd.timelineEvents.length, 0) + allTimelineEvents.length
    };

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.community',
        resourceType: 'report',
        success: true,
        details: { community: communityName }
      });
    }

    res.json({
      report: {
        type: 'Community Report',
        generatedAt: new Date().toISOString(),
        community: communityName,
        summary,
        cases: caseDetails,
        lovedOnes,
        standaloneTimelineEvents: allTimelineEvents,
        standaloneReminders: communityReminders,
        standaloneWitnesses: communityWitnesses
      }
    });
  } catch (err) {
    console.error('Failed to generate community report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.community',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate community report', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Workload Distribution Report
 * Analyzes workload distribution across caseworkers to identify imbalances
 */
async function getWorkloadDistributionReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    // Get all caseworkers
    const usersResult = await session.run(`
      MATCH (u:User)
      WHERE u.roles CONTAINS 'case_worker' OR u.roles CONTAINS 'admin'
      RETURN u.email as email, u.name as name
      ORDER BY u.name
    `);
    const caseworkers = usersResult.records.map(r => ({
      email: r.get('email'),
      name: r.get('name') || r.get('email')
    }));

    // Get workload for each caseworker
    const workloadData = await Promise.all(caseworkers.map(async (cw) => {
      const email = cw.email;

      // Cases assigned
      const casesResult = await session.run(`
        MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant)
        RETURN count(a) as totalCases,
               sum(CASE WHEN a.status = 'Active' THEN 1 ELSE 0 END) as activeCases,
               sum(CASE WHEN a.status = 'Closed' THEN 1 ELSE 0 END) as closedCases,
               sum(CASE WHEN a.status = 'Follow-up Required' THEN 1 ELSE 0 END) as followupCases,
               sum(CASE WHEN a.status = 'On Hold' THEN 1 ELSE 0 END) as onHoldCases
      `, { email });
      const casesData = casesResult.records[0];

      // Active reminders
      const remindersResult = await session.run(`
        MATCH (r:Reminder)
        WHERE r.assignedTo = $email AND r.completed = false
        RETURN 
          count(r) as activeReminders,
          sum(CASE WHEN r.dueDate < datetime() THEN 1 ELSE 0 END) as overdueReminders
      `, { email });
      const remindersData = remindersResult.records[0];

      // Count loved ones in active cases
      const lovedOnesResult = await session.run(`
        MATCH (u:User {email: $email})-[:ASSIGNED_TO]->(a:Applicant)-[:RELATED_TO]->(l:LovedOne)
        WHERE a.status = 'Active'
        RETURN count(DISTINCT l) as activeLovedOnes
      `, { email });
      const activeLovedOnes = lovedOnesResult.records[0]?.get('activeLovedOnes')?.toNumber() || 0;

      // Count recent timeline events created (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const eventsResult = await session.run(`
        MATCH (e:TimelineEvent)
        WHERE e.createdBy = $email AND e.timestamp >= $thirtyDaysAgo
        RETURN count(e) as recentEvents
      `, { email, thirtyDaysAgo });
      const recentEvents = eventsResult.records[0]?.get('recentEvents')?.toNumber() || 0;

      // Count witnesses reported to this caseworker
      const witnessesResult = await session.run(`
        MATCH (w:Witness)
        WHERE w.reportedTo = $email
        RETURN count(w) as totalWitnesses
      `, { email });
      const totalWitnesses = witnessesResult.records[0]?.get('totalWitnesses')?.toNumber() || 0;

      const totalCases = casesData.get('totalCases')?.toNumber() || 0;
      const activeCases = casesData.get('activeCases')?.toNumber() || 0;
      const activeReminders = remindersData.get('activeReminders')?.toNumber() || 0;
      const overdueReminders = remindersData.get('overdueReminders')?.toNumber() || 0;

      // Calculate workload score (weighted)
      // Active cases: 10 points each
      // Active reminders: 1 point each
      // Overdue reminders: 5 points each
      // Active loved ones: 2 points each
      const workloadScore = (activeCases * 10) + (activeReminders * 1) + (overdueReminders * 5) + (activeLovedOnes * 2);

      return {
        caseworker: cw.name,
        email: email,
        cases: {
          total: totalCases,
          active: activeCases,
          closed: casesData.get('closedCases')?.toNumber() || 0,
          followup: casesData.get('followupCases')?.toNumber() || 0,
          onHold: casesData.get('onHoldCases')?.toNumber() || 0
        },
        reminders: {
          active: activeReminders,
          overdue: overdueReminders
        },
        lovedOnes: {
          active: activeLovedOnes
        },
        activity: {
          recentEvents: recentEvents,
          witnesses: totalWitnesses
        },
        workloadScore: workloadScore
      };
    }));

    // Calculate statistics
    const workloadScores = workloadData.map(w => w.workloadScore).filter(s => s > 0);
    const avgWorkload = workloadScores.length > 0 
      ? workloadScores.reduce((a, b) => a + b, 0) / workloadScores.length 
      : 0;
    const maxWorkload = workloadScores.length > 0 ? Math.max(...workloadScores) : 0;
    const minWorkload = workloadScores.length > 0 ? Math.min(...workloadScores) : 0;

    // Categorize caseworkers
    const categorized = workloadData.map(w => {
      let category = 'balanced';
      if (w.workloadScore > avgWorkload * 1.5) {
        category = 'overloaded';
      } else if (w.workloadScore < avgWorkload * 0.5 && w.workloadScore > 0) {
        category = 'underloaded';
      } else if (w.workloadScore === 0) {
        category = 'no-workload';
      }
      return {
        ...w,
        category,
        deviationFromAverage: avgWorkload > 0 ? ((w.workloadScore - avgWorkload) / avgWorkload * 100).toFixed(1) : '0.0'
      };
    });

    // Sort by workload score (highest first)
    categorized.sort((a, b) => b.workloadScore - a.workloadScore);

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.workload_distribution',
        resourceType: 'report',
        success: true
      });
    }

    res.json({
      report: {
        type: 'Workload Distribution',
        generatedAt: new Date().toISOString(),
        statistics: {
          totalCaseworkers: caseworkers.length,
          averageWorkload: Math.round(avgWorkload),
          maxWorkload: maxWorkload,
          minWorkload: minWorkload,
          overloaded: categorized.filter(c => c.category === 'overloaded').length,
          balanced: categorized.filter(c => c.category === 'balanced').length,
          underloaded: categorized.filter(c => c.category === 'underloaded').length,
          noWorkload: categorized.filter(c => c.category === 'no-workload').length
        },
        caseworkers: categorized
      }
    });
  } catch (err) {
    console.error('Failed to generate workload distribution report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.workload_distribution',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate workload distribution report', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Missing Person Demographics Report
 * Analyzes demographics of missing persons (age, gender, time missing, status)
 */
async function getMissingPersonDemographicsReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { startDate, endDate } = req.query;

    // Build date filter if provided
    let dateFilter = '';
    const params = {};
    if (startDate && endDate) {
      dateFilter = 'WHERE l.createdAt >= $startDate AND l.createdAt <= $endDate';
      params.startDate = startDate;
      params.endDate = endDate;
    }

    // Get all loved ones with their data
    const lovedOnesResult = await session.run(`
      MATCH (l:LovedOne)
      ${dateFilter}
      RETURN l
      ORDER BY l.createdAt DESC
    `, params);

    const lovedOnes = lovedOnesResult.records.map(r => r.get('l').properties);

    // Calculate age groups
    const ageGroups = {
      '0-12': 0,
      '13-17': 0,
      '18-25': 0,
      '26-35': 0,
      '36-50': 0,
      '51-65': 0,
      '65+': 0,
      'Unknown': 0
    };

    // Gender distribution
    const genderDistribution = {
      'Male': 0,
      'Female': 0,
      'Other': 0,
      'Unknown': 0
    };

    // Time missing categories
    const timeMissing = {
      '0-24 hours': 0,
      '1-7 days': 0,
      '1-4 weeks': 0,
      '1-3 months': 0,
      '3-6 months': 0,
      '6-12 months': 0,
      '1+ years': 0,
      'Unknown': 0
    };

    // Status distribution
    const statusDistribution = {};

    // Age by status
    const ageByStatus = {};

    // Gender by status
    const genderByStatus = {};

    const now = new Date();

    lovedOnes.forEach(lo => {
      // Age group
      if (lo.age) {
        const age = parseInt(lo.age, 10);
        if (!isNaN(age)) {
          if (age <= 12) ageGroups['0-12']++;
          else if (age <= 17) ageGroups['13-17']++;
          else if (age <= 25) ageGroups['18-25']++;
          else if (age <= 35) ageGroups['26-35']++;
          else if (age <= 50) ageGroups['36-50']++;
          else if (age <= 65) ageGroups['51-65']++;
          else ageGroups['65+']++;
        } else {
          ageGroups['Unknown']++;
        }
      } else {
        ageGroups['Unknown']++;
      }

      // Gender
      const gender = lo.gender || lo.sex || 'Unknown';
      const genderKey = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
      if (genderDistribution.hasOwnProperty(genderKey)) {
        genderDistribution[genderKey]++;
      } else if (gender.toLowerCase() === 'm' || gender.toLowerCase() === 'male') {
        genderDistribution['Male']++;
      } else if (gender.toLowerCase() === 'f' || gender.toLowerCase() === 'female') {
        genderDistribution['Female']++;
      } else {
        genderDistribution['Unknown']++;
      }

      // Time missing
      if (lo.dateOfIncident) {
        try {
          const missingDate = new Date(lo.dateOfIncident);
          const daysMissing = Math.floor((now - missingDate) / (1000 * 60 * 60 * 24));
          
          if (daysMissing < 0) {
            timeMissing['Unknown']++;
          } else if (daysMissing <= 1) {
            timeMissing['0-24 hours']++;
          } else if (daysMissing <= 7) {
            timeMissing['1-7 days']++;
          } else if (daysMissing <= 28) {
            timeMissing['1-4 weeks']++;
          } else if (daysMissing <= 90) {
            timeMissing['1-3 months']++;
          } else if (daysMissing <= 180) {
            timeMissing['3-6 months']++;
          } else if (daysMissing <= 365) {
            timeMissing['6-12 months']++;
          } else {
            timeMissing['1+ years']++;
          }
        } catch (e) {
          timeMissing['Unknown']++;
        }
      } else {
        timeMissing['Unknown']++;
      }

      // Status
      const status = lo.status || 'Unknown';
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;

      // Age by status
      if (!ageByStatus[status]) {
        ageByStatus[status] = { ...ageGroups };
        Object.keys(ageByStatus[status]).forEach(key => ageByStatus[status][key] = 0);
      }
      if (lo.age) {
        const age = parseInt(lo.age, 10);
        if (!isNaN(age)) {
          if (age <= 12) ageByStatus[status]['0-12']++;
          else if (age <= 17) ageByStatus[status]['13-17']++;
          else if (age <= 25) ageByStatus[status]['18-25']++;
          else if (age <= 35) ageByStatus[status]['26-35']++;
          else if (age <= 50) ageByStatus[status]['36-50']++;
          else if (age <= 65) ageByStatus[status]['51-65']++;
          else ageByStatus[status]['65+']++;
        } else {
          ageByStatus[status]['Unknown']++;
        }
      } else {
        ageByStatus[status]['Unknown']++;
      }

      // Gender by status
      if (!genderByStatus[status]) {
        genderByStatus[status] = { ...genderDistribution };
        Object.keys(genderByStatus[status]).forEach(key => genderByStatus[status][key] = 0);
      }
      // Reuse genderKey from above (already declared in this scope)
      if (genderByStatus[status].hasOwnProperty(genderKey)) {
        genderByStatus[status][genderKey]++;
      } else if (gender.toLowerCase() === 'm' || gender.toLowerCase() === 'male') {
        genderByStatus[status]['Male']++;
      } else if (gender.toLowerCase() === 'f' || gender.toLowerCase() === 'female') {
        genderByStatus[status]['Female']++;
      } else {
        genderByStatus[status]['Unknown']++;
      }
    });

    // Convert to arrays for easier display
    const ageGroupArray = Object.entries(ageGroups).map(([group, count]) => ({ group, count }));
    const genderArray = Object.entries(genderDistribution).map(([gender, count]) => ({ gender, count }));
    const timeMissingArray = Object.entries(timeMissing).map(([period, count]) => ({ period, count }));
    const statusArray = Object.entries(statusDistribution).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);

    // Calculate risk factors (high-risk indicators)
    const riskFactors = {
      highRiskStatus: lovedOnes.filter(lo => {
        const status = (lo.status || '').toLowerCase();
        return status.includes('high risk') || status.includes('critical') || status.includes('urgent');
      }).length,
      longTermMissing: lovedOnes.filter(lo => {
        if (!lo.dateOfIncident) return false;
        try {
          const missingDate = new Date(lo.dateOfIncident);
          const daysMissing = Math.floor((now - missingDate) / (1000 * 60 * 60 * 24));
          return daysMissing > 365; // Missing over 1 year
        } catch (e) {
          return false;
        }
      }).length,
      minors: lovedOnes.filter(lo => {
        if (!lo.age) return false;
        const age = parseInt(lo.age, 10);
        return !isNaN(age) && age < 18;
      }).length,
      recentMissing: lovedOnes.filter(lo => {
        if (!lo.dateOfIncident) return false;
        try {
          const missingDate = new Date(lo.dateOfIncident);
          const daysMissing = Math.floor((now - missingDate) / (1000 * 60 * 60 * 24));
          return daysMissing <= 7; // Missing within last week
        } catch (e) {
          return false;
        }
      }).length
    };

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.missing_person_demographics',
        resourceType: 'report',
        success: true,
        details: { startDate, endDate }
      });
    }

    res.json({
      report: {
        type: 'Missing Person Demographics',
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        totalMissingPersons: lovedOnes.length,
        demographics: {
          ageGroups: ageGroupArray,
          gender: genderArray,
          timeMissing: timeMissingArray,
          status: statusArray
        },
        analysis: {
          ageByStatus,
          genderByStatus
        },
        riskFactors
      }
    });
  } catch (err) {
    console.error('Failed to generate missing person demographics report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.missing_person_demographics',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate missing person demographics report', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Witness Report
 * Analyzes witness data - total witnesses, statement analysis, reliability patterns, most active witnesses, follow-up needs
 */
async function getWitnessReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { startDate, endDate } = req.query;

    // Build date filter if provided
    let dateFilter = '';
    const params = {};
    if (startDate && endDate) {
      dateFilter = 'WHERE w.dateOfStatement >= $startDate AND w.dateOfStatement <= $endDate';
      params.startDate = startDate;
      params.endDate = endDate;
    }

    // Get all witnesses with their relationships
    const witnessesResult = await session.run(`
      MATCH (w:Witness)
      OPTIONAL MATCH (w)-[:WITNESSED]->(a:Applicant)
      OPTIONAL MATCH (w)-[:WITNESSED]->(l:LovedOne)
      OPTIONAL MATCH (w)-[:REPORTED_TO]->(u:User)
      ${dateFilter}
      RETURN w, a, l, u
      ORDER BY w.dateOfStatement DESC, w.createdAt DESC
    `, params);

    const witnesses = witnessesResult.records.map(r => {
      const witness = r.get('w').properties;
      const applicant = r.get('a');
      const lovedOne = r.get('l');
      const user = r.get('u');
      
      return {
        ...witness,
        metadata: witness.metadata ? JSON.parse(witness.metadata) : null,
        relatedTo: applicant ? { type: 'case', name: applicant.properties.name, id: applicant.properties.id } :
                 lovedOne ? { type: 'lovedOne', name: lovedOne.properties.name, id: lovedOne.properties.id } :
                 null,
        reportedToUser: user ? { email: user.properties.email, name: user.properties.name } : null
      };
    });

    // Calculate statistics
    const totalWitnesses = witnesses.length;
    
    // Witnesses by case/loved one
    const witnessesByCase = {};
    const witnessesByLovedOne = {};
    
    witnesses.forEach(w => {
      if (w.relatedTo) {
        if (w.relatedTo.type === 'case') {
          const caseId = w.relatedTo.id;
          if (!witnessesByCase[caseId]) {
            witnessesByCase[caseId] = {
              caseId,
              caseName: w.relatedTo.name,
              count: 0,
              witnesses: []
            };
          }
          witnessesByCase[caseId].count++;
          witnessesByCase[caseId].witnesses.push({
            name: w.name,
            dateOfStatement: w.dateOfStatement,
            hasStatement: !!w.statement,
            hasContact: !!(w.contact || w.address)
          });
        } else if (w.relatedTo.type === 'lovedOne') {
          const lovedOneId = w.relatedTo.id;
          if (!witnessesByLovedOne[lovedOneId]) {
            witnessesByLovedOne[lovedOneId] = {
              lovedOneId,
              lovedOneName: w.relatedTo.name,
              count: 0,
              witnesses: []
            };
          }
          witnessesByLovedOne[lovedOneId].count++;
          witnessesByLovedOne[lovedOneId].witnesses.push({
            name: w.name,
            dateOfStatement: w.dateOfStatement,
            hasStatement: !!w.statement,
            hasContact: !!(w.contact || w.address)
          });
        }
      }
    });

    // Statement analysis
    const statementAnalysis = {
      total: totalWitnesses,
      withStatement: witnesses.filter(w => w.statement && w.statement.trim().length > 0).length,
      withoutStatement: witnesses.filter(w => !w.statement || w.statement.trim().length === 0).length,
      withContact: witnesses.filter(w => w.contact || w.address).length,
      withoutContact: witnesses.filter(w => !w.contact && !w.address).length,
      complete: witnesses.filter(w => 
        w.statement && w.statement.trim().length > 0 && 
        (w.contact || w.address) && 
        w.dateOfStatement
      ).length,
      incomplete: witnesses.filter(w => 
        !w.statement || w.statement.trim().length === 0 || 
        (!w.contact && !w.address) || 
        !w.dateOfStatement
      ).length
    };

    // Statement length analysis
    const statementLengths = witnesses
      .filter(w => w.statement && w.statement.trim().length > 0)
      .map(w => w.statement.trim().length);
    
    const avgStatementLength = statementLengths.length > 0
      ? Math.round(statementLengths.reduce((sum, len) => sum + len, 0) / statementLengths.length)
      : 0;

    // Most active witnesses (witnesses who have provided statements for multiple cases/loved ones)
    const witnessActivity = {};
    witnesses.forEach(w => {
      const name = w.name || 'Unknown';
      if (!witnessActivity[name]) {
        witnessActivity[name] = {
          name,
          totalStatements: 0,
          cases: new Set(),
          lovedOnes: new Set(),
          hasContact: !!(w.contact || w.address),
          lastStatement: w.dateOfStatement || w.createdAt
        };
      }
      witnessActivity[name].totalStatements++;
      if (w.relatedTo) {
        if (w.relatedTo.type === 'case') {
          witnessActivity[name].cases.add(w.relatedTo.id);
        } else if (w.relatedTo.type === 'lovedOne') {
          witnessActivity[name].lovedOnes.add(w.relatedTo.id);
        }
      }
    });

    const mostActiveWitnesses = Object.values(witnessActivity)
      .map(w => ({
        name: w.name,
        totalStatements: w.totalStatements,
        uniqueCases: w.cases.size,
        uniqueLovedOnes: w.lovedOnes.size,
        totalUniqueEntities: w.cases.size + w.lovedOnes.size,
        hasContact: w.hasContact,
        lastStatement: w.lastStatement
      }))
      .sort((a, b) => b.totalStatements - a.totalStatements)
      .slice(0, 20); // Top 20

    // Witnesses by caseworker (who took the statement)
    const witnessesByCaseworker = {};
    witnesses.forEach(w => {
      const caseworker = w.reportedToUser ? w.reportedToUser.name || w.reportedToUser.email : 'Unassigned';
      if (!witnessesByCaseworker[caseworker]) {
        witnessesByCaseworker[caseworker] = {
          caseworker,
          count: 0,
          withStatement: 0,
          withoutStatement: 0
        };
      }
      witnessesByCaseworker[caseworker].count++;
      if (w.statement && w.statement.trim().length > 0) {
        witnessesByCaseworker[caseworker].withStatement++;
      } else {
        witnessesByCaseworker[caseworker].withoutStatement++;
      }
    });

    // Follow-up needs (witnesses without statements, contact info, or date)
    const followUpNeeds = witnesses
      .filter(w => 
        !w.statement || w.statement.trim().length === 0 || 
        (!w.contact && !w.address) || 
        !w.dateOfStatement
      )
      .map(w => ({
        name: w.name || 'Unknown',
        relatedTo: w.relatedTo ? `${w.relatedTo.name} (${w.relatedTo.type})` : 'Not linked',
        missingStatement: !w.statement || w.statement.trim().length === 0,
        missingContact: !w.contact && !w.address,
        missingDate: !w.dateOfStatement,
        reportedTo: w.reportedToUser ? w.reportedToUser.name || w.reportedToUser.email : 'Unassigned',
        createdAt: w.createdAt
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Witnesses by time period (when statement was taken)
    const witnessesByPeriod = {
      'Last 7 days': 0,
      'Last 30 days': 0,
      'Last 90 days': 0,
      'Last 6 months': 0,
      'Last year': 0,
      'Over 1 year': 0,
      'No date': 0
    };

    const now = new Date();
    witnesses.forEach(w => {
      if (!w.dateOfStatement) {
        witnessesByPeriod['No date']++;
        return;
      }
      
      try {
        const statementDate = new Date(w.dateOfStatement);
        const daysDiff = Math.floor((now - statementDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 0) {
          witnessesByPeriod['No date']++;
        } else if (daysDiff <= 7) {
          witnessesByPeriod['Last 7 days']++;
        } else if (daysDiff <= 30) {
          witnessesByPeriod['Last 30 days']++;
        } else if (daysDiff <= 90) {
          witnessesByPeriod['Last 90 days']++;
        } else if (daysDiff <= 180) {
          witnessesByPeriod['Last 6 months']++;
        } else if (daysDiff <= 365) {
          witnessesByPeriod['Last year']++;
        } else {
          witnessesByPeriod['Over 1 year']++;
        }
      } catch (e) {
        witnessesByPeriod['No date']++;
      }
    });

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.witness',
        resourceType: 'report',
        success: true,
        details: { startDate, endDate }
      });
    }

    res.json({
      report: {
        type: 'Witness Report',
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        summary: {
          totalWitnesses,
          statementAnalysis,
          avgStatementLength,
          totalCasesWithWitnesses: Object.keys(witnessesByCase).length,
          totalLovedOnesWithWitnesses: Object.keys(witnessesByLovedOne).length
        },
        witnessesByCase: Object.values(witnessesByCase).sort((a, b) => b.count - a.count),
        witnessesByLovedOne: Object.values(witnessesByLovedOne).sort((a, b) => b.count - a.count),
        mostActiveWitnesses,
        witnessesByCaseworker: Object.values(witnessesByCaseworker).sort((a, b) => b.count - a.count),
        witnessesByPeriod: Object.entries(witnessesByPeriod).map(([period, count]) => ({ period, count })),
        followUpNeeds: followUpNeeds.slice(0, 50) // Top 50 needing follow-up
      }
    });
  } catch (err) {
    console.error('Failed to generate witness report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.witness',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate witness report', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Family Report (Applicant Report)
 * Analyzes families/applicants - repeat applicants, demographics, communication preferences, support needs
 */
async function getFamilyReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { startDate, endDate } = req.query;

    // Build date filter if provided
    let dateFilter = '';
    const params = {};
    if (startDate && endDate) {
      dateFilter = 'WHERE a.createdAt >= $startDate AND a.createdAt <= $endDate';
      params.startDate = startDate;
      params.endDate = endDate;
    }

    // Get all applicants with their relationships
    const applicantsResult = await session.run(`
      MATCH (a:Applicant)
      OPTIONAL MATCH (a)-[:RELATED_TO]->(l:LovedOne)
      OPTIONAL MATCH (a)<-[:ASSIGNED_TO]-(:User)
      OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
      OPTIONAL MATCH (a)-[:REQUESTED]->(s:SupportService)
      ${dateFilter}
      RETURN a, collect(DISTINCT l) AS lovedOnes, collect(DISTINCT o) AS organizations, collect(DISTINCT s) AS supportServices
      ORDER BY a.createdAt DESC
    `, params);

    const applicants = applicantsResult.records.map(r => {
      const applicant = r.get('a').properties;
      const lovedOnes = r.get('lovedOnes').filter(lo => lo !== null).map(lo => lo.properties);
      const organizations = r.get('organizations').filter(org => org !== null).map(org => org.properties);
      const supportServices = r.get('supportServices').filter(svc => svc !== null).map(svc => svc.properties);
      
      return {
        ...applicant,
        lovedOnes,
        organizations,
        supportServices
      };
    });

    const totalFamilies = applicants.length;

    // Repeat applicants analysis (by email, name, or contact)
    const familiesByEmail = {};
    const familiesByName = {};
    const familiesByContact = {};
    
    applicants.forEach(a => {
      // Group by email
      if (a.email) {
        const email = a.email.toLowerCase().trim();
        if (!familiesByEmail[email]) {
          familiesByEmail[email] = [];
        }
        familiesByEmail[email].push(a);
      }
      
      // Group by name (normalized)
      if (a.name) {
        const name = a.name.toLowerCase().trim();
        if (!familiesByName[name]) {
          familiesByName[name] = [];
        }
        familiesByName[name].push(a);
      }
      
      // Group by contact (phone)
      if (a.contact) {
        const contact = a.contact.replace(/\D/g, ''); // Remove non-digits
        if (contact.length >= 10) {
          if (!familiesByContact[contact]) {
            familiesByContact[contact] = [];
          }
          familiesByContact[contact].push(a);
        }
      }
    });

    // Identify repeat applicants
    const repeatApplicants = [];
    const seenEmails = new Set();
    const seenNames = new Set();
    const seenContacts = new Set();

    Object.entries(familiesByEmail).forEach(([email, familyList]) => {
      if (familyList.length > 1 && !seenEmails.has(email)) {
        seenEmails.add(email);
        repeatApplicants.push({
          identifier: email,
          type: 'email',
          count: familyList.length,
          cases: familyList.map(f => ({ id: f.id, name: f.name, status: f.status, createdAt: f.createdAt }))
        });
      }
    });

    Object.entries(familiesByName).forEach(([name, familyList]) => {
      if (familyList.length > 1 && !seenNames.has(name)) {
        // Check if not already counted by email
        const hasEmailMatch = familyList.some(f => f.email && seenEmails.has(f.email.toLowerCase().trim()));
        if (!hasEmailMatch) {
          seenNames.add(name);
          repeatApplicants.push({
            identifier: name,
            type: 'name',
            count: familyList.length,
            cases: familyList.map(f => ({ id: f.id, name: f.name, status: f.status, createdAt: f.createdAt }))
          });
        }
      }
    });

    Object.entries(familiesByContact).forEach(([contact, familyList]) => {
      if (familyList.length > 1 && !seenContacts.has(contact)) {
        // Check if not already counted by email or name
        const hasEmailMatch = familyList.some(f => f.email && seenEmails.has(f.email.toLowerCase().trim()));
        const hasNameMatch = familyList.some(f => f.name && seenNames.has(f.name.toLowerCase().trim()));
        if (!hasEmailMatch && !hasNameMatch) {
          seenContacts.add(contact);
          repeatApplicants.push({
            identifier: contact,
            type: 'phone',
            count: familyList.length,
            cases: familyList.map(f => ({ id: f.id, name: f.name, status: f.status, createdAt: f.createdAt }))
          });
        }
      }
    });

    // Demographics
    const provinceDistribution = {};
    const communityDistribution = {};
    const statusDistribution = {};
    const languageDistribution = {};

    applicants.forEach(a => {
      // Province
      const province = a.province || 'Unknown';
      provinceDistribution[province] = (provinceDistribution[province] || 0) + 1;

      // Community
      const community = a.community || 'Unknown';
      communityDistribution[community] = (communityDistribution[community] || 0) + 1;

      // Status
      const status = a.status || 'Unknown';
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;

      // Language
      const language = a.language || 'Unknown';
      languageDistribution[language] = (languageDistribution[language] || 0) + 1;
    });

    // Communication preferences
    const communicationAnalysis = {
      total: totalFamilies,
      smsOptIn: applicants.filter(a => a.smsOptIn === true).length,
      smsOptOut: applicants.filter(a => a.smsOptIn === false).length,
      smsNotSet: applicants.filter(a => a.smsOptIn === null || a.smsOptIn === undefined).length,
      emailOptIn: applicants.filter(a => a.emailOptIn === true).length,
      emailOptOut: applicants.filter(a => a.emailOptIn === false).length,
      emailNotSet: applicants.filter(a => a.emailOptIn === null || a.emailOptIn === undefined).length,
      hasEmail: applicants.filter(a => a.email && a.email.trim().length > 0).length,
      hasPhone: applicants.filter(a => a.contact && a.contact.trim().length > 0).length,
      hasBoth: applicants.filter(a => 
        a.email && a.email.trim().length > 0 && 
        a.contact && a.contact.trim().length > 0
      ).length,
      hasNeither: applicants.filter(a => 
        (!a.email || a.email.trim().length === 0) && 
        (!a.contact || a.contact.trim().length === 0)
      ).length
    };

    // Cases per family (missing persons per family)
    const missingPersonsPerFamily = applicants.map(a => ({
      familyId: a.id,
      familyName: a.name,
      missingPersonsCount: a.lovedOnes ? a.lovedOnes.length : 0,
      status: a.status,
      community: a.community || 'Unknown'
    })).sort((a, b) => b.missingPersonsCount - a.missingPersonsCount);

    // Support services analysis
    const supportServicesCount = {};
    const familiesWithSupport = applicants.filter(a => a.supportServices && a.supportServices.length > 0);
    
    familiesWithSupport.forEach(a => {
      a.supportServices.forEach(svc => {
        const svcType = svc.type || 'Unknown';
        supportServicesCount[svcType] = (supportServicesCount[svcType] || 0) + 1;
      });
    });

    // Families by time period
    const familiesByPeriod = {
      'Last 7 days': 0,
      'Last 30 days': 0,
      'Last 90 days': 0,
      'Last 6 months': 0,
      'Last year': 0,
      'Over 1 year': 0,
      'No date': 0
    };

    const now = new Date();
    applicants.forEach(a => {
      if (!a.createdAt) {
        familiesByPeriod['No date']++;
        return;
      }
      
      try {
        const createdDate = new Date(a.createdAt);
        const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 0) {
          familiesByPeriod['No date']++;
        } else if (daysDiff <= 7) {
          familiesByPeriod['Last 7 days']++;
        } else if (daysDiff <= 30) {
          familiesByPeriod['Last 30 days']++;
        } else if (daysDiff <= 90) {
          familiesByPeriod['Last 90 days']++;
        } else if (daysDiff <= 180) {
          familiesByPeriod['Last 6 months']++;
        } else if (daysDiff <= 365) {
          familiesByPeriod['Last year']++;
        } else {
          familiesByPeriod['Over 1 year']++;
        }
      } catch (e) {
        familiesByPeriod['No date']++;
      }
    });

    // Families needing follow-up (incomplete contact info, no communication preferences set)
    const followUpNeeds = applicants
      .filter(a => 
        (!a.email || a.email.trim().length === 0) || 
        (!a.contact || a.contact.trim().length === 0) ||
        (a.smsOptIn === null && a.emailOptIn === null) ||
        (!a.community || a.community.trim().length === 0)
      )
      .map(a => ({
        id: a.id,
        name: a.name || 'Unknown',
        missingEmail: !a.email || a.email.trim().length === 0,
        missingPhone: !a.contact || a.contact.trim().length === 0,
        missingCommPrefs: a.smsOptIn === null && a.emailOptIn === null,
        missingCommunity: !a.community || a.community.trim().length === 0,
        status: a.status || 'Unknown',
        createdAt: a.createdAt
      }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.family',
        resourceType: 'report',
        success: true,
        details: { startDate, endDate }
      });
    }

    res.json({
      report: {
        type: 'Family Report',
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        summary: {
          totalFamilies,
          repeatApplicantsCount: repeatApplicants.length,
          familiesWithMultipleMissingPersons: missingPersonsPerFamily.filter(f => f.missingPersonsCount > 1).length,
          familiesWithSupport: familiesWithSupport.length
        },
        repeatApplicants: repeatApplicants.sort((a, b) => b.count - a.count).slice(0, 50), // Top 50
        demographics: {
          province: Object.entries(provinceDistribution).map(([province, count]) => ({ province, count })).sort((a, b) => b.count - a.count),
          community: Object.entries(communityDistribution).map(([community, count]) => ({ community, count })).sort((a, b) => b.count - a.count).slice(0, 20), // Top 20
          status: Object.entries(statusDistribution).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
          language: Object.entries(languageDistribution).map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count)
        },
        communicationAnalysis,
        missingPersonsPerFamily: missingPersonsPerFamily.slice(0, 50), // Top 50
        supportServices: Object.entries(supportServicesCount).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        familiesByPeriod: Object.entries(familiesByPeriod).map(([period, count]) => ({ period, count })),
        followUpNeeds: followUpNeeds.slice(0, 50) // Top 50
      }
    });
  } catch (err) {
    console.error('Failed to generate family report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.family',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate family report', details: err.message });
  } finally {
    await session.close();
  }
}

/**
 * Get Communications Report
 * Analyzes SMS and Email communications - who received messages, opt-in status, frequency, etc.
 */
async function getCommunicationsReport(req, res, driver, auditLogger) {
  const session = driver.session();
  try {
    const { startDate, endDate } = req.query;

    // Build date filter if provided
    let dateFilter = '';
    const params = {};
    if (startDate && endDate) {
      dateFilter = 'WHERE e.timestamp >= $startDate AND e.timestamp <= $endDate';
      params.startDate = startDate;
      params.endDate = endDate;
    }

    // Get all SMS and Email events from CaseEvent nodes
    const eventsResult = await session.run(`
      MATCH (a:Applicant)-[:HAS_EVENT]->(e:CaseEvent)
      WHERE e.type IN ['sms', 'email']
      ${dateFilter}
      RETURN a, e
      ORDER BY e.timestamp DESC
    `, params);

    const communications = eventsResult.records.map(r => {
      const applicant = r.get('a').properties;
      const event = r.get('e').properties;
      return {
        caseId: applicant.id,
        caseName: applicant.name,
        email: applicant.email,
        contact: applicant.contact,
        smsOptIn: applicant.smsOptIn,
        emailOptIn: applicant.emailOptIn,
        type: event.type,
        description: event.description,
        timestamp: event.timestamp,
        user: event.user
      };
    });

    // Get all applicants with their communication preferences
    const applicantsResult = await session.run(`
      MATCH (a:Applicant)
      RETURN a
    `);

    const allApplicants = applicantsResult.records.map(r => r.get('a').properties);

    // Communication statistics
    const smsCount = communications.filter(c => c.type === 'sms').length;
    const emailCount = communications.filter(c => c.type === 'email').length;
    const totalCommunications = communications.length;

    // Communications by recipient
    const communicationsByRecipient = {};
    communications.forEach(c => {
      const key = c.caseId;
      if (!communicationsByRecipient[key]) {
        communicationsByRecipient[key] = {
          caseId: c.caseId,
          caseName: c.caseName,
          email: c.email,
          contact: c.contact,
          smsOptIn: c.smsOptIn,
          emailOptIn: c.emailOptIn,
          smsCount: 0,
          emailCount: 0,
          totalCount: 0,
          lastSms: null,
          lastEmail: null,
          lastCommunication: null
        };
      }
      communicationsByRecipient[key].totalCount++;
      if (c.type === 'sms') {
        communicationsByRecipient[key].smsCount++;
        if (!communicationsByRecipient[key].lastSms || c.timestamp > communicationsByRecipient[key].lastSms) {
          communicationsByRecipient[key].lastSms = c.timestamp;
        }
      } else if (c.type === 'email') {
        communicationsByRecipient[key].emailCount++;
        if (!communicationsByRecipient[key].lastEmail || c.timestamp > communicationsByRecipient[key].lastEmail) {
          communicationsByRecipient[key].lastEmail = c.timestamp;
        }
      }
      if (!communicationsByRecipient[key].lastCommunication || c.timestamp > communicationsByRecipient[key].lastCommunication) {
        communicationsByRecipient[key].lastCommunication = c.timestamp;
      }
    });

    // Communications by caseworker (who sent them)
    const communicationsByCaseworker = {};
    communications.forEach(c => {
      const caseworker = c.user || 'Unknown';
      if (!communicationsByCaseworker[caseworker]) {
        communicationsByCaseworker[caseworker] = {
          caseworker,
          smsCount: 0,
          emailCount: 0,
          totalCount: 0
        };
      }
      communicationsByCaseworker[caseworker].totalCount++;
      if (c.type === 'sms') {
        communicationsByCaseworker[caseworker].smsCount++;
      } else if (c.type === 'email') {
        communicationsByCaseworker[caseworker].emailCount++;
      }
    });

    // Communications by time period
    const communicationsByPeriod = {
      'Last 7 days': 0,
      'Last 30 days': 0,
      'Last 90 days': 0,
      'Last 6 months': 0,
      'Last year': 0,
      'Over 1 year': 0,
      'No date': 0
    };

    const now = new Date();
    communications.forEach(c => {
      if (!c.timestamp) {
        communicationsByPeriod['No date']++;
        return;
      }
      
      try {
        const commDate = new Date(c.timestamp);
        const daysDiff = Math.floor((now - commDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 0) {
          communicationsByPeriod['No date']++;
        } else if (daysDiff <= 7) {
          communicationsByPeriod['Last 7 days']++;
        } else if (daysDiff <= 30) {
          communicationsByPeriod['Last 30 days']++;
        } else if (daysDiff <= 90) {
          communicationsByPeriod['Last 90 days']++;
        } else if (daysDiff <= 180) {
          communicationsByPeriod['Last 6 months']++;
        } else if (daysDiff <= 365) {
          communicationsByPeriod['Last year']++;
        } else {
          communicationsByPeriod['Over 1 year']++;
        }
      } catch (e) {
        communicationsByPeriod['No date']++;
      }
    });

    // Opt-in analysis
    const optInAnalysis = {
      totalApplicants: allApplicants.length,
      smsOptIn: allApplicants.filter(a => a.smsOptIn === true).length,
      smsOptOut: allApplicants.filter(a => a.smsOptIn === false).length,
      smsNotSet: allApplicants.filter(a => a.smsOptIn === null || a.smsOptIn === undefined).length,
      emailOptIn: allApplicants.filter(a => a.emailOptIn === true).length,
      emailOptOut: allApplicants.filter(a => a.emailOptIn === false).length,
      emailNotSet: allApplicants.filter(a => a.emailOptIn === null || a.emailOptIn === undefined).length,
      hasPhone: allApplicants.filter(a => a.contact && a.contact.trim().length > 0).length,
      hasEmail: allApplicants.filter(a => a.email && a.email.trim().length > 0).length,
      canReceiveSms: allApplicants.filter(a => 
        a.contact && a.contact.trim().length > 0 && a.smsOptIn === true
      ).length,
      canReceiveEmail: allApplicants.filter(a => 
        a.email && a.email.trim().length > 0 && a.emailOptIn === true
      ).length
    };

    // Most contacted recipients
    const mostContacted = Object.values(communicationsByRecipient)
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 50);

    // Recent communications (last 50)
    const recentCommunications = communications
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 50);

    // Communication frequency analysis
    const frequencyAnalysis = {
      recipientsWith1Comm: Object.values(communicationsByRecipient).filter(r => r.totalCount === 1).length,
      recipientsWith2to5Comm: Object.values(communicationsByRecipient).filter(r => r.totalCount >= 2 && r.totalCount <= 5).length,
      recipientsWith6to10Comm: Object.values(communicationsByRecipient).filter(r => r.totalCount >= 6 && r.totalCount <= 10).length,
      recipientsWith11to20Comm: Object.values(communicationsByRecipient).filter(r => r.totalCount >= 11 && r.totalCount <= 20).length,
      recipientsWith21PlusComm: Object.values(communicationsByRecipient).filter(r => r.totalCount > 20).length
    };

    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.communications',
        resourceType: 'report',
        success: true,
        details: { startDate, endDate }
      });
    }

    res.json({
      report: {
        type: 'Communications Report',
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        summary: {
          totalCommunications,
          smsCount,
          emailCount,
          uniqueRecipients: Object.keys(communicationsByRecipient).length,
          uniqueCaseworkers: Object.keys(communicationsByCaseworker).length
        },
        optInAnalysis,
        communicationsByPeriod: Object.entries(communicationsByPeriod).map(([period, count]) => ({ period, count })),
        communicationsByCaseworker: Object.values(communicationsByCaseworker).sort((a, b) => b.totalCount - a.totalCount),
        mostContacted,
        recentCommunications,
        frequencyAnalysis
      }
    });
  } catch (err) {
    console.error('Failed to generate communications report:', err);
    
    if (auditLogger) {
      await auditLogger.log(req, {
        action: 'reports.communications',
        resourceType: 'report',
        success: false,
        message: err.message
      });
    }

    res.status(500).json({ error: 'Failed to generate communications report', details: err.message });
  } finally {
    await session.close();
  }
}

module.exports = {
  getCaseStatisticsReport,
  getCaseworkerActivityReport,
  getCaseDetailExport,
  getCommunityReport,
  getWorkloadDistributionReport,
  getMissingPersonDemographicsReport,
  getWitnessReport,
  getFamilyReport,
  getCommunicationsReport
};

