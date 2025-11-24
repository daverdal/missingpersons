const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');
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

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error(`Too many redirects for URL: ${url}`));
      return;
    }

    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (urlErr) {
      reject(new Error(`Invalid URL: ${url} - ${urlErr.message}`));
      return;
    }

    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MissingPersons-RSS-Reader/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      rejectUnauthorized: true
    };

    const req = client.request(options, res => {
      // Handle redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        try {
          const redirectUrl = new URL(res.headers.location, url).href;
          return fetchUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
        } catch (redirectErr) {
          reject(new Error(`Invalid redirect URL: ${res.headers.location} - ${redirectErr.message}`));
          return;
        }
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Failed to fetch URL ${url}: status ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => {
        data += chunk.toString('utf8');
      });
      res.on('end', () => {
        if (!data || !data.trim()) {
          reject(new Error(`Empty response from URL: ${url}`));
          return;
        }
        resolve(data);
      });
    });
    
    req.on('error', err => {
      reject(new Error(`Request error for URL ${url}: ${err.message}`));
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Request timeout for URL: ${url}`));
    });
    
    req.end();
  });
}

async function fetchRssItems(url) {
  const xml = await fetchUrl(url);
  if (!xml || !xml.trim()) {
    throw new Error('Empty RSS feed response');
  }
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseAttributeValue: false,
    parseNodeValue: true,
    ignoreNameSpace: true,
    removeNSPrefix: true
  });
  
  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (parseErr) {
    console.error('[offender-news] XML parse error for URL:', url, parseErr.message);
    throw new Error(`Failed to parse RSS feed XML: ${parseErr.message}`);
  }
  
  // Handle both RSS 2.0 and Atom feeds
  let channel = {};
  let items = [];
  
  if (parsed?.rss?.channel) {
    // RSS 2.0 format
    channel = parsed.rss.channel;
    items = channel.item || [];
  } else if (parsed?.feed) {
    // Atom format
    channel = { title: parsed.feed.title || '' };
    items = parsed.feed.entry || [];
  } else {
    console.warn('[offender-news] Unexpected RSS feed structure for URL:', url);
    throw new Error('Unsupported RSS feed format');
  }
  
  if (!Array.isArray(items)) {
    items = items ? [items] : [];
  }
  
  return items.map(raw => {
    // Handle RSS 2.0 format
    let guidRaw = raw.guid;
    let title = raw.title || '';
    let link = raw.link || '';
    let description = raw.description || '';
    let pubDate = raw.pubDate || raw.pubdate || null;
    
    // Handle Atom format
    if (raw.id && !guidRaw) {
      guidRaw = raw.id;
    }
    if (raw.title && typeof raw.title === 'object' && raw.title['#text']) {
      title = raw.title['#text'];
    }
    if (raw.link && typeof raw.link === 'object') {
      link = raw.link.href || raw.link['#text'] || '';
    } else if (Array.isArray(raw.link)) {
      link = raw.link[0]?.href || raw.link[0]?.['#text'] || '';
    }
    if (raw.summary && !description) {
      description = typeof raw.summary === 'object' ? raw.summary['#text'] || '' : raw.summary;
    }
    if (raw.updated && !pubDate) {
      pubDate = raw.updated;
    }
    if (raw.published && !pubDate) {
      pubDate = raw.published;
    }
    
    const guid =
      (guidRaw && typeof guidRaw === 'object' && guidRaw['#text']) ||
      (guidRaw && typeof guidRaw === 'string' && guidRaw) ||
      link;
    
    const channelTitle = 
      (channel.title && typeof channel.title === 'object' && channel.title['#text']) ||
      (channel.title && typeof channel.title === 'string' && channel.title) ||
      'Winnipeg Media Releases';
    
    return {
      id: guid || link || `item-${Date.now()}-${Math.random()}`,
      title: title || '(no title)',
      link: link || '',
      description: description || '',
      pubDate: pubDate || null,
      source: channelTitle
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
  console.log('[offender-news] init() called');
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

  console.log('[offender-news] dependencies received:', {
    hasAuthMiddleware: !!authMiddleware,
    hasRequireRole: !!requireRole,
    hasAuditLogger: !!auditLogger,
    hasNewsModel: !!newsModel,
    hasSmsService: !!smsService,
    hasCaseEventModel: !!caseEventModel,
    hasConfigModel: !!configModel,
    hasConfig: !!config,
    policeRssUrl: config.policeRssUrl,
    manitobaRssUrl: config.manitobaRssUrl
  });

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
      console.error('[offender-news] error details:', err.message, err.stack);

      if (auditLogger) {
        try {
          await auditLogger.log(req, {
            action: 'offender-news.fetch_emails',
            resourceType: 'offender_news',
            success: false,
            message: err.message,
            details: { error: err.toString() }
          });
        } catch (logErr) {
          console.error('[offender-news] failed to log audit for email error', logErr);
        }
      }

      res.status(500).json({ 
        error: 'Failed to fetch offender news emails.',
        details: err.message || 'Unknown error'
      });
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
    console.log('[offender-news] /police-rss route called');
    const url = config.policeRssUrl;
    console.log('[offender-news] policeRssUrl from config:', url);
    if (!url) {
      console.error('[offender-news] Police RSS URL is not configured');
      res.status(500).json({ error: 'Police RSS URL is not configured.' });
      return;
    }

    try {
      console.log('[offender-news] Fetching RSS items from:', url);
      const items = await fetchRssItems(url);
      console.log('[offender-news] Fetched', items.length, 'RSS items');

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
      console.error('[offender-news] error details:', err.message, err.stack);

      if (auditLogger) {
        try {
          await auditLogger.log(req, {
            action: 'offender-news.fetch_police_rss',
            resourceType: 'offender_news',
            success: false,
            message: err.message,
            details: { source: url, error: err.toString() }
          });
        } catch (logErr) {
          console.error('[offender-news] failed to log audit for police RSS error', logErr);
        }
      }

      res.status(500).json({ 
        error: 'Failed to fetch police RSS feed.',
        details: err.message || 'Unknown error'
      });
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
      console.error('[offender-news] error details:', err.message, err.stack);

      if (auditLogger) {
        try {
          await auditLogger.log(req, {
            action: 'offender-news.fetch_manitoba_rss',
            resourceType: 'offender_news',
            success: false,
            message: err.message,
            details: { source: url, error: err.toString() }
          });
        } catch (logErr) {
          console.error('[offender-news] failed to log audit for Manitoba RSS error', logErr);
        }
      }

      res.status(500).json({ 
        error: 'Failed to fetch Manitoba RSS feed.',
        details: err.message || 'Unknown error'
      });
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

  // Register routes with authentication middleware
  // Note: All routes require authentication (admin role)
  const middleware = [];
  if (authMiddleware) {
    middleware.push(authMiddleware);
  } else {
    console.warn('[offender-news] authMiddleware not provided, routes will be unauthenticated');
  }
  
  if (requireRole && typeof requireRole === 'function') {
    try {
      const roleMiddleware = requireRole('admin');
      if (roleMiddleware && typeof roleMiddleware === 'function') {
        middleware.push(roleMiddleware);
      }
    } catch (roleErr) {
      console.error('[offender-news] failed to create requireRole middleware', roleErr);
      // Continue without role requirement if it fails
    }
  } else {
    console.warn('[offender-news] requireRole not provided or not a function, routes will not have role-based access control');
  }

  try {
    console.log('[offender-news] Registering routes with', middleware.length, 'middleware functions');
    if (middleware.length > 0) {
      app.use('/api/offender-news', ...middleware, router);
      console.log('[offender-news] Routes registered with middleware at /api/offender-news');
    } else {
      app.use('/api/offender-news', router);
      console.log('[offender-news] Routes registered without middleware at /api/offender-news');
    }
    console.log('[offender-news] ✓ Module initialised - routes registered at /api/offender-news');
    console.log('[offender-news] ✓ Registered routes: /emails, /police-rss, /manitoba, /news-items, /matches, /email-credentials');
    
    // Test route registration by checking app._router
    const routes = [];
    if (app._router && app._router.stack) {
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          routes.push(`${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
        } else if (middleware.regexp && middleware.regexp.toString().includes('offender-news')) {
          routes.push(`MOUNTED ${middleware.regexp}`);
        }
      });
    }
    console.log('[offender-news] Total routes in app:', routes.length);
  } catch (registerErr) {
    console.error('[offender-news] ✗ FAILED to register routes', registerErr);
    console.error('[offender-news] ✗ Registration error details:', registerErr.message);
    console.error('[offender-news] ✗ Stack:', registerErr.stack);
    throw registerErr;
  }
}

module.exports = {
  init
};
