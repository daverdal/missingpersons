const express = require('express');
const emailService = require('./emailService');

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function init(app, dependencies = {}) {
  if (!app) {
    throw new Error('Express app instance is required');
  }

  const {
    authMiddleware,
    requireRole,
    auditLogger,
    config = {}
  } = dependencies;

  const router = express.Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/emails', async (req, res) => {
    const limit = parseInteger(req.query.limit, config.defaultLimit || 25);

    try {
      const emails = await emailService.fetchEmails({
        host: config.host,
        port: parseInteger(config.port, 993),
        secure: parseBool(config.secure, true),
        username: config.username,
        password: config.password,
        mailbox: config.mailbox || 'INBOX'
      }, { limit });

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_emails',
          resourceType: 'offender_news',
          success: true,
          details: { count: emails.length }
        });
      }

      res.json({ emails });
    } catch (err) {
      console.error('[offender-news] failed to fetch emails', err);

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_emails',
          resourceType: 'offender_news',
          success: false,
          message: err.message
        });
      }

      res.status(500).json({ error: 'Failed to fetch offender news emails.' });
    }
  });

  const middleware = [];
  if (authMiddleware) middleware.push(authMiddleware);
  if (requireRole) middleware.push(requireRole('admin'));

  app.use('/api/offender-news', ...middleware, router);

  console.log('[offender-news] module initialised');
}

module.exports = {
  init
};

