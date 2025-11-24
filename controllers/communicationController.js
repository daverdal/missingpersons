/**
 * Communication Controller
 * Handles SMS and Email communication operations
 */

// Email sending safeguards: Track daily email count (in-memory, resets daily)
const emailSendTracker = {
  date: null,
  count: 0,
  maxDailyLimit: parseInt(process.env.EMAIL_DAILY_LIMIT || '400', 10) // Default 400 (safe margin under 500)
};

// Progress tracking for email blasts (in-memory, keyed by job ID)
const emailBlastProgress = new Map();

function getTodayDateString() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTodayEmailCount() {
  const today = getTodayDateString();
  if (emailSendTracker.date !== today) {
    emailSendTracker.date = today;
    emailSendTracker.count = 0;
  }
  return emailSendTracker.count;
}

function incrementEmailCount(count = 1) {
  const today = getTodayDateString();
  if (emailSendTracker.date !== today) {
    emailSendTracker.date = today;
    emailSendTracker.count = 0;
  }
  emailSendTracker.count += count;
  return emailSendTracker.count;
}

// Validate email address format
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0) return false;
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

// Check for potential spam trigger words (warning only)
function checkSpamWords(text) {
  const spamWords = [
    'free', 'click here', 'act now', 'limited time', 'urgent', 'guarantee',
    'winner', 'congratulations', 'prize', 'cash', '$$$', 'viagra', 'casino'
  ];
  const lowerText = text.toLowerCase();
  const found = spamWords.filter(word => lowerText.includes(word));
  return found;
}

// Normalize phone number to E.164 format
function normalizePhone(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return '+1' + digits;
  }
  if (digits.length > 0) {
    return '+' + digits;
  }
  return '';
}

/**
 * Get email settings
 */
async function getEmailSettings(req, res, configModel, auditLogger) {
  try {
    const stored = await configModel.get('email_settings') || {};
    
    // Calculate effective settings (what's actually being used for email blasts)
    let effectiveSettings = null;
    let dbSettings = stored;
    
    // Check if stored settings have all required fields
    if (dbSettings && typeof dbSettings === 'object' && 
        dbSettings.smtpHost && dbSettings.smtpUser && dbSettings.smtpPass && dbSettings.emailFrom) {
      effectiveSettings = { ...dbSettings };
    }
    
    // If no complete database settings, try Offender News email config
    if (!effectiveSettings) {
      let emailConfig = {
        host: process.env.OFFENDER_NEWS_EMAIL_IMAP_HOST || null,
        username: process.env.OFFENDER_NEWS_EMAIL_USERNAME || null,
        password: process.env.OFFENDER_NEWS_EMAIL_PASSWORD || null
      };
      
      try {
        const offenderNewsConfig = await configModel.get('offender_news_email');
        if (offenderNewsConfig && typeof offenderNewsConfig === 'object') {
          emailConfig = {
            host: offenderNewsConfig.host || emailConfig.host,
            username: offenderNewsConfig.username || emailConfig.username,
            password: offenderNewsConfig.password || emailConfig.password
          };
        }
      } catch (err) {
        // Ignore errors
      }
      
      // For Gmail, convert IMAP settings to SMTP
      if (emailConfig.host && emailConfig.username && emailConfig.password) {
        effectiveSettings = {
          smtpHost: emailConfig.host.includes('gmail') ? 'smtp.gmail.com' : emailConfig.host.replace('imap', 'smtp'),
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: emailConfig.username,
          smtpPass: '***hidden***', // Don't expose password
          emailFrom: emailConfig.username,
          emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
        };
        
        // Merge in any partial settings from database
        if (dbSettings && typeof dbSettings === 'object') {
          if (dbSettings.emailFrom) effectiveSettings.emailFrom = dbSettings.emailFrom;
          if (dbSettings.emailFromName) effectiveSettings.emailFromName = dbSettings.emailFromName;
          if (dbSettings.emailReplyTo !== undefined) effectiveSettings.emailReplyTo = dbSettings.emailReplyTo;
          if (dbSettings.smtpPort) effectiveSettings.smtpPort = dbSettings.smtpPort;
          if (dbSettings.smtpSecure !== undefined) effectiveSettings.smtpSecure = dbSettings.smtpSecure;
        }
      }
    }
    
    // Fall back to environment variables if still no settings
    if (!effectiveSettings) {
      effectiveSettings = {
        smtpHost: process.env.SMTP_HOST || null,
        smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
        smtpSecure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        smtpUser: process.env.SMTP_USER || null,
        smtpPass: process.env.SMTP_PASS ? '***hidden***' : null,
        emailFrom: process.env.EMAIL_FROM || process.env.SMTP_FROM || null,
        emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
      };
      
      // Merge in any partial settings from database
      if (dbSettings && typeof dbSettings === 'object') {
        if (dbSettings.emailFrom) effectiveSettings.emailFrom = dbSettings.emailFrom;
        if (dbSettings.emailFromName) effectiveSettings.emailFromName = dbSettings.emailFromName;
        if (dbSettings.emailReplyTo !== undefined) effectiveSettings.emailReplyTo = dbSettings.emailReplyTo;
        if (dbSettings.smtpPort) effectiveSettings.smtpPort = dbSettings.smtpPort;
        if (dbSettings.smtpSecure !== undefined) effectiveSettings.smtpSecure = dbSettings.smtpSecure;
      }
    }
    
    // Hide password in stored settings too
    const storedForDisplay = { ...stored };
    if (storedForDisplay.smtpPass) {
      storedForDisplay.smtpPass = '***hidden***';
    }
    
    res.json({ 
      settings: storedForDisplay,
      effective: effectiveSettings,
      source: effectiveSettings === stored ? 'database' : 
              (process.env.OFFENDER_NEWS_EMAIL_USERNAME ? 'offender_news_config' : 'environment')
    });
  } catch (err) {
    console.error('Failed to fetch email settings:', err);
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
}

/**
 * Save email settings
 */
async function saveEmailSettings(req, res, configModel, auditLogger) {
  try {
    const {
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPass,
      emailFrom,
      emailFromName,
      emailReplyTo
    } = req.body || {};

    // Get existing settings to preserve values that aren't being updated
    const existing = await configModel.get('email_settings');
    const existingSettings = existing && typeof existing === 'object' ? existing : {};
    
    // Validate port if provided
    if (smtpPort !== undefined && smtpPort !== null && smtpPort !== '') {
      const portNum = parseInt(smtpPort, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({ error: 'SMTP Port must be a valid port number (1-65535)' });
      }
    }

    // Build settings object, using existing values if not provided
    const settings = {
      smtpHost: smtpHost && String(smtpHost).trim() ? String(smtpHost).trim() : (existingSettings.smtpHost || null),
      smtpPort: smtpPort !== undefined && smtpPort !== null && smtpPort !== '' 
        ? parseInt(smtpPort, 10) 
        : (existingSettings.smtpPort !== undefined ? existingSettings.smtpPort : 587),
      smtpSecure: smtpSecure !== undefined && smtpSecure !== '' && smtpSecure !== null
        ? (smtpSecure === true || smtpSecure === 'true')
        : (existingSettings.smtpSecure !== undefined ? existingSettings.smtpSecure : false),
      smtpUser: smtpUser && String(smtpUser).trim() ? String(smtpUser).trim() : (existingSettings.smtpUser || null),
      emailFrom: emailFrom && String(emailFrom).trim() ? String(emailFrom).trim() : (existingSettings.emailFrom || null),
      emailFromName: emailFromName !== undefined && emailFromName !== null
        ? (emailFromName && String(emailFromName).trim() ? String(emailFromName).trim() : null)
        : (existingSettings.emailFromName !== undefined ? existingSettings.emailFromName : null),
      emailReplyTo: emailReplyTo !== undefined && emailReplyTo !== null
        ? (emailReplyTo && String(emailReplyTo).trim() ? String(emailReplyTo).trim() : null)
        : (existingSettings.emailReplyTo !== undefined ? existingSettings.emailReplyTo : null)
    };

    // Allow partial updates - don't require all fields to be present
    // Validation of required fields will happen when actually sending emails

    // Only update password if provided, otherwise preserve existing
    if (smtpPass && String(smtpPass).trim()) {
      settings.smtpPass = String(smtpPass).trim();
    } else if (existingSettings.smtpPass) {
      settings.smtpPass = existingSettings.smtpPass;
    }
    // Note: Password is not required for partial updates - validation happens when sending emails

    // Save to database
    await configModel.set('email_settings', settings);

    await auditLogger.log(req, {
      action: 'email.settings.update',
      resourceType: 'email_settings',
      success: true,
      details: {
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUser: settings.smtpUser,
        emailFrom: settings.emailFrom
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save email settings:', err);
    await auditLogger.log(req, {
      action: 'email.settings.update',
      resourceType: 'email_settings',
      success: false,
      message: err.message
    });
    res.status(500).json({ error: 'Failed to save email settings' });
  }
}

/**
 * Send SMS blast to all opted-in applicants
 */
async function sendSmsBlast(req, res, driver, smsService, caseEventModel, auditLogger) {
  if (!smsService.isConfigured()) {
    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: false,
      message: 'SMS service not configured'
    });
    return res.status(503).json({ error: 'SMS service is not configured' });
  }

  const { message } = req.body || {};
  const trimmedMessage = (message || '').trim();
  if (!trimmedMessage) {
    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: false,
      message: 'Message is required'
    });
    return res.status(400).json({ error: 'Message is required' });
  }

  const session = driver.session();
  try {
    // Get all applicants with phone numbers who have explicitly opted in to SMS
    // NULL is treated as opted-out (privacy-first approach)
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.contact IS NOT NULL AND a.contact <> '' AND a.smsOptIn = true
       RETURN a.id AS id, a.name AS name, a.contact AS contact, a.smsOptIn AS smsOptIn`
    );

    const applicants = result.records.map(r => ({
      id: r.get('id'),
      name: r.get('name') || '',
      contact: r.get('contact') || '',
      smsOptIn: r.get('smsOptIn') || false
    }));

    if (applicants.length === 0) {
      // Check if there are any clients with phone numbers at all (for debugging)
      const checkResult = await session.run(
        `MATCH (a:Applicant)
         WHERE a.contact IS NOT NULL AND a.contact <> ''
         RETURN count(a) AS total, 
                sum(CASE WHEN a.smsOptIn = true THEN 1 ELSE 0 END) AS optedIn,
                sum(CASE WHEN a.smsOptIn = false THEN 1 ELSE 0 END) AS optedOut,
                sum(CASE WHEN a.smsOptIn IS NULL THEN 1 ELSE 0 END) AS notSet`
      );
      const record = checkResult.records[0];
      const total = record ? (record.get('total')?.toNumber ? record.get('total').toNumber() : Number(record.get('total') || 0)) : 0;
      const optedIn = record ? (record.get('optedIn')?.toNumber ? record.get('optedIn').toNumber() : Number(record.get('optedIn') || 0)) : 0;
      const optedOut = record ? (record.get('optedOut')?.toNumber ? record.get('optedOut').toNumber() : Number(record.get('optedOut') || 0)) : 0;
      const notSet = record ? (record.get('notSet')?.toNumber ? record.get('notSet').toNumber() : Number(record.get('notSet') || 0)) : 0;
      
      await auditLogger.log(req, {
        action: 'sms.blast',
        resourceType: 'sms',
        resourceId: null,
        success: false,
        message: 'No applicants with phone numbers and SMS opt-in found',
        details: { total, optedIn, optedOut, notSet }
      });
      return res.status(400).json({ 
        error: 'No applicants with phone numbers and SMS opt-in found',
        details: `Total clients with phone numbers: ${total}. Opted in: ${optedIn}, Opted out: ${optedOut}, Not set: ${notSet}. Please ensure clients have opted in to receive SMS messages.`
      });
    }

    let sent = 0;
    let failed = 0;
    const errors = [];

    // Send SMS to each applicant
    for (const applicant of applicants) {
      const normalizedPhone = normalizePhone(applicant.contact);
      if (!normalizedPhone) {
        failed++;
        errors.push(`${applicant.name || applicant.id}: Invalid phone number format`);
        continue;
      }

      try {
        await smsService.sendSms({
          to: normalizedPhone,
          body: trimmedMessage
        });
        sent++;

        // Log as case event if possible
        try {
          await caseEventModel.addEvent(applicant.id, {
            type: 'sms',
            description: `SMS blast sent: "${trimmedMessage.length > 50 ? trimmedMessage.substring(0, 47) + '...' : trimmedMessage}"`,
            user: req.user.name || req.user.email || 'admin'
          });
        } catch (logErr) {
          console.warn(`SMS sent to ${applicant.id} but failed to log case event:`, logErr);
        }
      } catch (smsErr) {
        failed++;
        errors.push(`${applicant.name || applicant.id}: ${smsErr.message}`);
        console.error(`Failed to send SMS to ${applicant.id} (${normalizedPhone}):`, smsErr);
      }
    }

    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: true,
      details: {
        total: applicants.length,
        sent,
        failed,
        messageLength: trimmedMessage.length
      }
    });

    res.json({
      success: true,
      total: applicants.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Failed to send SMS blast:', err);
    console.error('Error stack:', err.stack);
    await auditLogger.log(req, {
      action: 'sms.blast',
      resourceType: 'sms',
      resourceId: null,
      success: false,
      message: 'Failed to send SMS blast',
      details: { error: err.message, code: err.code }
    });
    res.status(500).json({ 
      error: 'Failed to send SMS blast', 
      details: err.message,
      code: err.code
    });
  } finally {
    await session.close();
  }
}

/**
 * Get email blast progress
 */
function getEmailBlastProgress(req, res, auditLogger) {
  const { jobId } = req.params;
  const progress = emailBlastProgress.get(jobId);
  if (!progress) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(progress);
}

/**
 * Send email blast to all opted-in applicants
 */
async function sendEmailBlast(req, res, driver, configModel, caseEventModel, auditLogger) {
  const { subject, message } = req.body || {};
  const trimmedSubject = (subject || '').trim();
  const trimmedMessage = (message || '').trim();
  
  if (!trimmedSubject || !trimmedMessage) {
    await auditLogger.log(req, {
      action: 'email.blast',
      resourceType: 'email',
      resourceId: null,
      success: false,
      message: 'Subject and message are required'
    });
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  // Check for spam words (warning only, don't block)
  const spamWords = checkSpamWords(trimmedSubject + ' ' + trimmedMessage);
  if (spamWords.length > 0) {
    console.warn('Potential spam words detected:', spamWords);
  }

  // Get email settings: check database first, then Offender News config, then environment variables
  let emailSettings = null;
  let dbSettings = null;
  
  // Try to get email settings from database first
  try {
    dbSettings = await configModel.get('email_settings');
    // Only use database settings if they have all required fields
    if (dbSettings && typeof dbSettings === 'object' && 
        dbSettings.smtpHost && dbSettings.smtpUser && dbSettings.smtpPass && dbSettings.emailFrom) {
      emailSettings = dbSettings;
    }
  } catch (err) {
    console.warn('Could not load email settings from database, trying other sources');
  }
  
  // If no complete database settings, try Offender News email config
  if (!emailSettings) {
    let emailConfig = {
      host: process.env.OFFENDER_NEWS_EMAIL_IMAP_HOST || null,
      username: process.env.OFFENDER_NEWS_EMAIL_USERNAME || null,
      password: process.env.OFFENDER_NEWS_EMAIL_PASSWORD || null
    };
    
    try {
      const stored = await configModel.get('offender_news_email');
      if (stored && typeof stored === 'object') {
        emailConfig = {
          host: stored.host || emailConfig.host,
          username: stored.username || emailConfig.username,
          password: stored.password || emailConfig.password
        };
      }
    } catch (err) {
      // If we can't get stored config, use environment variables
      console.warn('Could not load stored email config, using environment variables');
    }
    
    // For Gmail, convert IMAP settings to SMTP
    // Gmail SMTP uses smtp.gmail.com on port 587 (TLS) or 465 (SSL)
    if (emailConfig.host && emailConfig.username && emailConfig.password) {
      emailSettings = {
        smtpHost: emailConfig.host.includes('gmail') ? 'smtp.gmail.com' : emailConfig.host.replace('imap', 'smtp'),
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: emailConfig.username,
        smtpPass: emailConfig.password,
        emailFrom: emailConfig.username,
        emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
      };
      
      // Merge in any partial settings from database (like emailFrom, emailFromName, emailReplyTo)
      if (dbSettings && typeof dbSettings === 'object') {
        if (dbSettings.emailFrom) emailSettings.emailFrom = dbSettings.emailFrom;
        if (dbSettings.emailFromName) emailSettings.emailFromName = dbSettings.emailFromName;
        if (dbSettings.emailReplyTo !== undefined) emailSettings.emailReplyTo = dbSettings.emailReplyTo;
        if (dbSettings.smtpPort) emailSettings.smtpPort = dbSettings.smtpPort;
        if (dbSettings.smtpSecure !== undefined) emailSettings.smtpSecure = dbSettings.smtpSecure;
      }
    }
  }
  
  // Fall back to environment variables if still no settings
  if (!emailSettings) {
    emailSettings = {
      smtpHost: process.env.SMTP_HOST || null,
      smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
      smtpSecure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      smtpUser: process.env.SMTP_USER || null,
      smtpPass: process.env.SMTP_PASS || null,
      emailFrom: process.env.EMAIL_FROM || process.env.SMTP_FROM || null,
      emailReplyTo: process.env.EMAIL_BLAST_REPLY_TO || null
    };
    
    // Merge in any partial settings from database (like emailFrom, emailFromName, emailReplyTo)
    if (dbSettings && typeof dbSettings === 'object') {
      if (dbSettings.emailFrom) emailSettings.emailFrom = dbSettings.emailFrom;
      if (dbSettings.emailFromName) emailSettings.emailFromName = dbSettings.emailFromName;
      if (dbSettings.emailReplyTo !== undefined) emailSettings.emailReplyTo = dbSettings.emailReplyTo;
      if (dbSettings.smtpPort) emailSettings.smtpPort = dbSettings.smtpPort;
      if (dbSettings.smtpSecure !== undefined) emailSettings.smtpSecure = dbSettings.smtpSecure;
    }
  }
  
  const emailFrom = emailSettings.emailFrom;
  const emailHost = emailSettings.smtpHost;
  const emailUser = emailSettings.smtpUser;
  const emailPass = emailSettings.smtpPass;
  
  if (!emailFrom || !emailHost || !emailUser || !emailPass) {
    await auditLogger.log(req, {
      action: 'email.blast',
      resourceType: 'email',
      resourceId: null,
      success: false,
      message: 'Email service not configured'
    });
    return res.status(503).json({ 
      error: 'Email service is not configured. Please configure email settings in the Email Settings page or set SMTP_* environment variables.' 
    });
  }

  // Check daily email limit before proceeding
  const todayCount = getTodayEmailCount();
  // Generate a job ID for progress tracking
  const jobId = require('uuid').v4();
  const progress = {
    jobId,
    total: 0,
    sent: 0,
    failed: 0,
    current: 0,
    status: 'starting',
    startTime: new Date().toISOString(),
    errors: []
  };
  emailBlastProgress.set(jobId, progress);

  // Clean up old progress entries (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [id, p] of emailBlastProgress.entries()) {
    if (new Date(p.startTime).getTime() < oneHourAgo) {
      emailBlastProgress.delete(id);
    }
  }

  const session = driver.session();
  try {
    // Get all applicants with email addresses who have explicitly opted in to email
    // NULL is treated as opted-out (privacy-first approach)
    const result = await session.run(
      `MATCH (a:Applicant)
       WHERE a.email IS NOT NULL AND a.email <> '' AND a.emailOptIn = true
       RETURN a.id AS id, a.name AS name, a.email AS email, a.emailOptIn AS emailOptIn`
    );

    const applicants = result.records.map(r => ({
      id: r.get('id'),
      name: r.get('name') || '',
      email: r.get('email') || ''
    })).filter(a => isValidEmail(a.email)); // Filter out invalid emails upfront

    if (applicants.length === 0) {
      emailBlastProgress.delete(jobId);
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: 'No applicants with valid email addresses found'
      });
      return res.status(400).json({ error: 'No applicants with valid email addresses found' });
    }

    // Check if sending this batch would exceed daily limit
    const wouldExceed = todayCount + applicants.length > emailSendTracker.maxDailyLimit;
    if (wouldExceed) {
      const remaining = Math.max(0, emailSendTracker.maxDailyLimit - todayCount);
      emailBlastProgress.delete(jobId);
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: `Daily email limit would be exceeded. ${remaining} emails remaining today.`
      });
      return res.status(429).json({ 
        error: `Daily email limit would be exceeded. You can send ${remaining} more emails today (${todayCount}/${emailSendTracker.maxDailyLimit} already sent). Please try again tomorrow or send in smaller batches.` 
      });
    }

    // Create transporter for sending emails
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (requireErr) {
      emailBlastProgress.delete(jobId);
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: 'nodemailer package not installed'
      });
      return res.status(503).json({ 
        error: 'Email service requires nodemailer package. Please run: npm install nodemailer' 
      });
    }

    // Create transporter using settings from database/env
    const smtpPort = emailSettings.smtpPort || 587;
    const smtpSecure = emailSettings.smtpSecure || false;
    
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    // Update progress
    progress.total = applicants.length;
    progress.status = 'sending';
    emailBlastProgress.set(jobId, progress);

    // Return job ID immediately and continue processing in background
    res.json({ 
      success: true, 
      jobId,
      message: 'Email blast started. Use the jobId to track progress.'
    });

    // Continue processing asynchronously (don't await)
    processEmailBlastAsync(jobId, applicants, trimmedSubject, trimmedMessage, emailFrom, transporter, emailSettings, emailUser, req, auditLogger, caseEventModel, spamWords).catch(err => {
      console.error('Email blast async processing error:', err);
      const finalProgress = emailBlastProgress.get(jobId);
      if (finalProgress) {
        finalProgress.status = 'error';
        finalProgress.error = err.message;
        emailBlastProgress.set(jobId, finalProgress);
      }
    });
  } catch (err) {
    emailBlastProgress.delete(jobId);
    console.error('Failed to start email blast:', err);
    // Only send response if headers haven't been sent yet
    if (!res.headersSent) {
      await auditLogger.log(req, {
        action: 'email.blast',
        resourceType: 'email',
        resourceId: null,
        success: false,
        message: 'Failed to start email blast',
        details: { error: err.message }
      });
      res.status(500).json({ 
        error: 'Failed to start email blast', 
        details: err.message
      });
    }
  } finally {
    await session.close();
  }
}

// Async function to process email blast (runs in background)
async function processEmailBlastAsync(jobId, applicants, trimmedSubject, trimmedMessage, emailFrom, transporter, emailSettings, emailUser, req, auditLogger, caseEventModel, spamWords) {
  let sent = 0;
  let failed = 0;
  const errors = [];
  const progress = emailBlastProgress.get(jobId);
  
  if (!progress) {
    console.error('Progress tracking not found for job:', jobId);
    return;
  }

  try {
    // Email sending configuration
    const RATE_LIMIT_DELAY_MS = 1200; // 1.2 second delay = ~50 emails/minute (safe for Gmail)
    const BATCH_SIZE = 20; // Send in batches of 20
    const BATCH_BREAK_MS = 5000; // 5 second break between batches
    const MAX_RETRIES = 2; // Retry failed sends up to 2 times
    const RETRY_DELAY_MS = 3000; // 3 second delay before retry

    // Helper function to update progress
    function updateProgress() {
      if (progress) {
        progress.sent = sent;
        progress.failed = failed;
        progress.current = sent + failed;
        progress.errors = errors.slice(-10); // Keep last 10 errors
        emailBlastProgress.set(jobId, progress);
      }
    }

    // Helper function to send a single email with retry logic
    async function sendEmailWithRetry(applicant, retryCount = 0) {
      const email = applicant.email.trim();
      
      try {
        // Use a separate reply-to address for replies
        // Note: Bounces typically go to the "from" address (envelope sender), not replyTo
        // To redirect bounces, you need to use a separate email account for the "from" address
        const replyTo = emailSettings.emailReplyTo || process.env.EMAIL_BLAST_REPLY_TO || null;
        
        // Format the "from" address with optional display name
        // Note: Gmail will always show the authenticated account's email address
        // even if we try to use a different "from" address. The display name can be customized.
        let fromAddress = emailFrom;
        if (emailSettings.emailFromName) {
          // Use display name with the authenticated email (Gmail requirement)
          // The email address will still show, but the display name will be what we set
          fromAddress = `${emailSettings.emailFromName} <${emailUser}>`;
        } else {
          // If no display name, use the authenticated email
          fromAddress = emailUser;
        }
        
        const mailOptions = {
          from: fromAddress,
          to: email,
          subject: trimmedSubject,
          text: trimmedMessage,
          html: trimmedMessage.replace(/\n/g, '<br>')
        };
        
        // Only add replyTo if specified (some servers don't like null replyTo)
        if (replyTo) {
          mailOptions.replyTo = replyTo;
        }
        
        await transporter.sendMail(mailOptions);
        return { success: true };
      } catch (emailErr) {
        const errorMsg = emailErr.message || 'Unknown error';
        const errorCode = emailErr.code || emailErr.responseCode;
        
        // Check if this is a retryable error
        const isRetryable = (
          errorMsg.toLowerCase().includes('timeout') ||
          errorMsg.toLowerCase().includes('connection') ||
          errorMsg.toLowerCase().includes('temporary') ||
          errorCode === 'ETIMEDOUT' ||
          errorCode === 'ECONNRESET' ||
          (errorCode >= 500 && errorCode < 600) // Server errors
        );
        
        // Check if this is a rate limit/quota error
        const isRateLimit = (
          errorMsg.toLowerCase().includes('rate limit') ||
          errorMsg.toLowerCase().includes('too many') ||
          errorMsg.toLowerCase().includes('quota') ||
          errorMsg.toLowerCase().includes('exceeded') ||
          errorCode === 550 ||
          errorCode === 421 ||
          (errorCode >= 430 && errorCode < 450)
        );
        
        // Retry if retryable and haven't exceeded max retries
        if (isRetryable && retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
          return sendEmailWithRetry(applicant, retryCount + 1);
        }
        
        return { 
          success: false, 
          error: errorMsg,
          isRateLimit,
          isRetryable
        };
      }
    }

    // Send emails in batches with breaks
    for (let batchStart = 0; batchStart < applicants.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, applicants.length);
      const batch = applicants.slice(batchStart, batchEnd);
      
      console.log(`Sending email batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (${batchStart + 1}-${batchEnd} of ${applicants.length})`);
      
      for (let i = 0; i < batch.length; i++) {
        const applicant = batch[i];
        const email = applicant.email.trim();
        
        if (!isValidEmail(email)) {
          failed++;
          errors.push(`${applicant.name || applicant.id}: Invalid email address format`);
          updateProgress();
          continue;
        }

        const result = await sendEmailWithRetry(applicant);
        
        if (result.success) {
          sent++;
          incrementEmailCount(1);

          // Log as case event if possible
          try {
            await caseEventModel.addEvent(applicant.id, {
              type: 'email',
              description: `Email blast sent: "${trimmedSubject}"`,
              user: req.user.name || req.user.email || 'admin'
            });
          } catch (logErr) {
            console.warn(`Email sent to ${applicant.id} but failed to log case event:`, logErr);
          }
        } else {
          failed++;
          errors.push(`${applicant.name || applicant.id}: ${result.error}`);
          console.error(`Failed to send email to ${applicant.id} (${email}):`, result.error);
          
          // If we hit a rate limit error, add extra delay and consider stopping
          if (result.isRateLimit) {
            console.warn('Rate limit detected, adding extended delay...');
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS * 10)); // 12 second delay
            
            // If we're getting rate limited, warn but continue with longer delays
            if (failed > applicants.length * 0.1) { // If more than 10% are failing
              console.warn('High failure rate detected, consider stopping the blast');
            }
          }
        }
        
        // Update progress after each email
        updateProgress();
        
        // Rate limiting: add delay between emails (except for the last one in batch)
        if (i < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
      }
      
      // Break between batches (except after the last batch)
      if (batchEnd < applicants.length) {
        console.log(`Batch complete. Taking ${BATCH_BREAK_MS / 1000} second break before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_BREAK_MS));
      }
    }

    // Mark as complete
    const finalCount = getTodayEmailCount();
    progress.status = 'completed';
    progress.endTime = new Date().toISOString();
    progress.sent = sent;
    progress.failed = failed;
    progress.errors = errors;
    emailBlastProgress.set(jobId, progress);

    await auditLogger.log(req, {
      action: 'email.blast',
      resourceType: 'email',
      resourceId: jobId,
      success: true,
      details: {
        total: applicants.length,
        sent,
        failed,
        subject: trimmedSubject,
        messageLength: trimmedMessage.length,
        dailyCount: finalCount,
        spamWordsDetected: spamWords.length > 0 ? spamWords : undefined
      }
    });

    // Clean up progress after 1 hour
    setTimeout(() => {
      emailBlastProgress.delete(jobId);
    }, 60 * 60 * 1000);
  } catch (err) {
    console.error('Error in email blast async processing:', err);
    if (progress) {
      progress.status = 'error';
      progress.error = err.message;
      emailBlastProgress.set(jobId, progress);
    }
  }
}

module.exports = {
  getEmailSettings,
  saveEmailSettings,
  sendSmsBlast,
  getEmailBlastProgress,
  sendEmailBlast
};

