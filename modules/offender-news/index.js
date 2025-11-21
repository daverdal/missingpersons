const express = require('express');
const https = require('https');
const { XMLParser } = require('fast-xml-parser');
const emailService = require('./emailService');

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    const req = client.get(url, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Failed to fetch URL ${url}: status ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => {
        data += chunk.toString('utf8');
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

async function fetchRssItems(url) {
  const xml = await fetchUrl(url);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true
  });
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel || {};
  let items = channel.item || [];
  if (!Array.isArray(items)) {
    items = items ? [items] : [];
  }
  return items.map(raw => {
    const guidRaw = raw.guid;
    const guid =
      (guidRaw && typeof guidRaw === 'object' && guidRaw['#text']) ||
      (guidRaw && typeof guidRaw === 'string' && guidRaw) ||
      raw.link;
    return {
      id: guid || raw.link,
      title: raw.title || '',
      link: raw.link || '',
      description: raw.description || '',
      pubDate: raw.pubDate || null,
      source: channel.title || 'Winnipeg Media Releases'
    };
  });
}

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

async function sendAutomaticSmsForItems({ items, newsModel, smsService, caseEventModel, auditLogger }) {
  if (!items || !items.length) return;
  if (!newsModel || !smsService || !caseEventModel) return;
  if (!smsService.isConfigured || !smsService.isConfigured()) {
    console.warn('[offender-news] automatic SMS skipped: smsService not configured');
    return;
  }

  const newsIds = items.map(item => item.id).filter(Boolean);
  if (!newsIds.length) {
    console.warn('[offender-news] automatic SMS skipped: no news item ids');
    return;
  }

  let matches = [];
  try {
    matches = await newsModel.findUnnotifiedMatchesForNewsIds(newsIds);
  } catch (err) {
    console.error('[offender-news] failed to query unnotified matches', err);
    return;
  }
  if (!matches.length) {
    console.log('[offender-news] automatic SMS: no un-notified matches found');
    return;
  }

  console.log('[offender-news] automatic SMS: processing matches', matches.length);

  const successfullyNotified = [];

  for (const m of matches) {
    const newsItem = m.newsItem || {};
    const applicant = m.applicant || {};
    const caseId = applicant.id;
    const contactRaw = applicant && applicant.contact ? String(applicant.contact) : '';
    const to = normalizePhone(contactRaw);
    if (!caseId || !to) {
      if (!caseId) {
        console.warn('[offender-news] automatic SMS: match without applicant id, skipping');
      } else {
        console.warn('[offender-news] automatic SMS: no valid phone for case', caseId);
      }
      continue;
    }

    const title = newsItem.title || '';
    const link = newsItem.link || '';
    const keyword = m.keyword || '';
    const parts = [];
    if (title) parts.push(title);
    if (link) parts.push(link);
    if (keyword) parts.push(`(matched: ${keyword})`);
    const body = parts.join(' - ').slice(0, 500); // keep SMS reasonably short

    try {
      console.log('[offender-news] automatic SMS: sending to', to, 'for case', caseId, 'newsId', newsItem.id, 'keyword', keyword);
      await smsService.sendSms({ to, body });
      successfullyNotified.push({
        newsItemId: newsItem.id,
        applicantId: caseId,
        keyword
      });

      // Log as case event (best-effort)
      try {
        await caseEventModel.addEvent(caseId, {
          type: 'sms',
          description: `News alert SMS sent: ${title || '(no title)'}`,
          user: 'system'
        });
      } catch (eventErr) {
        console.warn('[offender-news] SMS sent but failed to log case event', eventErr);
      }

      if (auditLogger) {
        await auditLogger.log(null, {
          action: 'offender-news.auto_sms',
          resourceType: 'offender_news',
          resourceId: caseId,
          success: true,
          details: {
            newsId: newsItem.id,
            keyword,
            to
          }
        });
      }
    } catch (smsErr) {
      console.error('[offender-news] automatic SMS send failed', smsErr);
      if (auditLogger) {
        await auditLogger.log(null, {
          action: 'offender-news.auto_sms',
          resourceType: 'offender_news',
          resourceId: caseId,
          success: false,
          message: smsErr.message,
          details: {
            newsId: newsItem.id,
            keyword
          }
        });
      }
    }
  }

  if (successfullyNotified.length) {
    try {
      await newsModel.markMatchesNotified(successfullyNotified);
    } catch (markErr) {
      console.error('[offender-news] failed to mark matches as notified', markErr);
    }
  }
}

function init(app, dependencies = {}) {
  if (!app) {
    throw new Error('Express app instance is required');
  }

  const {
    authMiddleware,
    requireRole,
    auditLogger,
    newsModel,
    smsService,
    caseEventModel,
    configModel,
    config = {}
  } = dependencies;

  const router = express.Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Mutable email configuration so admin can update credentials at runtime
  const emailConfig = {
    host: config.host,
    port: parseInteger(config.port, 993),
    secure: parseBool(config.secure, true),
    username: config.username,
    password: config.password,
    mailbox: config.mailbox || 'INBOX'
  };

  router.get('/emails', async (req, res) => {
    const limit = parseInteger(req.query.limit, config.defaultLimit || 25);

    try {
      const emails = await emailService.fetchEmails(
        {
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure,
          username: emailConfig.username,
          password: emailConfig.password,
          mailbox: emailConfig.mailbox
        },
        { limit }
      );

      console.log(`[offender-news] Fetched ${emails.length} emails from inbox (limit: ${limit})`);

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

  // Update email credentials (admin only, via module-level middleware)
  router.post('/email-credentials', async (req, res) => {
    const { username, password } = req.body || {};

    if (!password || !String(password).trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (username && String(username).trim()) {
      emailConfig.username = String(username).trim();
    }
    emailConfig.password = String(password);

    // Persist to Neo4j so credentials survive restarts (if configModel available)
    if (configModel) {
      try {
        await configModel.set('offender_news_email', {
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure,
          username: emailConfig.username,
          password: emailConfig.password,
          mailbox: emailConfig.mailbox
        });
      } catch (persistErr) {
        console.error('[offender-news] failed to persist email credentials', persistErr);
      }
    }

    try {
      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.update_email_credentials',
          resourceType: 'offender_news',
          success: true,
          details: {
            updatedUsername: Boolean(username && String(username).trim())
          }
        });
      }
    } catch (logErr) {
      console.warn('[offender-news] failed to audit email credential update', logErr);
    }

    return res.json({ success: true });
  });

  router.get('/police-rss', async (req, res) => {
    const url = config.policeRssUrl;
    if (!url) {
      res.status(500).json({ error: 'Police RSS URL is not configured.' });
      return;
    }

    try {
      const items = await fetchRssItems(url);

      if (newsModel && items.length) {
        try {
          await newsModel.upsertMany(
            items.map(item => ({
              id: item.id,
              source: item.source,
              title: item.title,
              link: item.link,
              publishedAt: item.pubDate,
              description: item.description
            }))
          );
        } catch (dbErr) {
          console.error('[offender-news] failed to persist police RSS items', dbErr);
        }

        // After storing items, attempt automatic SMS notifications for new matches
        try {
          await sendAutomaticSmsForItems({
            items,
            newsModel,
            smsService,
            caseEventModel,
            auditLogger
          });
        } catch (autoErr) {
          console.error('[offender-news] automatic SMS for police RSS failed', autoErr);
        }
      }

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_police_rss',
          resourceType: 'offender_news',
          success: true,
          details: { count: items.length, source: url }
        });
      }

      res.json({ items });
    } catch (err) {
      console.error('[offender-news] failed to fetch police RSS feed', err);

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_police_rss',
          resourceType: 'offender_news',
          success: false,
          message: err.message,
          details: { source: url }
        });
      }

      res.status(500).json({ error: 'Failed to fetch police RSS feed.' });
    }
  });

  router.get('/manitoba', async (req, res) => {
    const url = config.manitobaRssUrl;
    if (!url) {
      res.status(500).json({ error: 'Manitoba RSS URL is not configured.' });
      return;
    }

    try {
      const items = await fetchRssItems(url);

      if (newsModel && items.length) {
        try {
          await newsModel.upsertMany(
            items.map(item => ({
              id: item.id,
              source: 'Manitoba Government News',
              title: item.title,
              link: item.link,
              publishedAt: item.pubDate,
              description: item.description
            }))
          );
        } catch (dbErr) {
          console.error('[offender-news] failed to persist Manitoba RSS items', dbErr);
        }

        // Automatic SMS notifications for Manitoba RSS items
        try {
          await sendAutomaticSmsForItems({
            items,
            newsModel,
            smsService,
            caseEventModel,
            auditLogger
          });
        } catch (autoErr) {
          console.error('[offender-news] automatic SMS for Manitoba RSS failed', autoErr);
        }
      }

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_manitoba_rss',
          resourceType: 'offender_news',
          success: true,
          details: { count: items.length, source: url }
        });
      }

      res.json({ items });
    } catch (err) {
      console.error('[offender-news] failed to fetch Manitoba RSS feed', err);

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_manitoba_rss',
          resourceType: 'offender_news',
          success: false,
          message: err.message,
          details: { source: url }
        });
      }

      res.status(500).json({ error: 'Failed to fetch Manitoba RSS feed.' });
    }
  });

  router.get('/news-items', async (req, res) => {
    if (!newsModel) {
      res.status(500).json({ error: 'News model is not available.' });
      return;
    }

    const limit = parseInteger(req.query.limit, 500);
    // Ensure it's an integer (not float) for Neo4j
    const limitInt = Math.floor(limit);

    try {
      const items = await newsModel.getAll(limitInt);

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_news_items',
          resourceType: 'offender_news',
          success: true,
          details: { count: items.length }
        });
      }

      res.json({ items });
    } catch (err) {
      console.error('[offender-news] failed to fetch news items', err);

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_news_items',
          resourceType: 'offender_news',
          success: false,
          message: err.message
        });
      }

      res.status(500).json({ error: 'Failed to fetch news items.' });
    }
  });

  router.get('/matches', async (req, res) => {
    if (!newsModel) {
      res.status(500).json({ error: 'News model is not available.' });
      return;
    }

    try {
      const matches = await newsModel.findKeywordMatches(200);

      // Attempt automatic SMS for any un-notified matches involving
      // the NewsItems present in this result set.
      if (matches && matches.length && smsService && caseEventModel && smsService.isConfigured && smsService.isConfigured()) {
        const items = matches
          .map(m => m.newsItem)
          .filter(n => n && n.id);
        if (items.length) {
          try {
            await sendAutomaticSmsForItems({
              items,
              newsModel,
              smsService,
              caseEventModel,
              auditLogger
            });
          } catch (autoErr) {
            console.error('[offender-news] automatic SMS via /matches failed', autoErr);
          }
        }
      }

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_matches',
          resourceType: 'offender_news',
          success: true,
          details: { count: matches.length }
        });
      }

      res.json({ matches });
    } catch (err) {
      console.error('[offender-news] failed to fetch news keyword matches', err);

      if (auditLogger) {
        await auditLogger.log(req, {
          action: 'offender-news.fetch_matches',
          resourceType: 'offender_news',
          success: false,
          message: err.message
        });
      }

      res.status(500).json({ error: 'Failed to fetch offender news matches.' });
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
