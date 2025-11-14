// auditLogger.js
// Centralized helper for writing audit entries and streaming them to SSE clients

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_RETENTION_DAYS = 730;
const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'token',
  'authorization',
  'cookie',
  'cookies',
  'secret',
  'ssn',
  'sin',
  'apikey',
  'apiKey',
  'api_key'
]);
const ARRAY_TRUNCATE_AT = 50;
const STRING_TRUNCATE_AT = 2000;

class AuditLogger extends EventEmitter {
  constructor({ model, retentionDays = DEFAULT_RETENTION_DAYS } = {}) {
    super();
    if (!model) {
      throw new Error('AuditLogger requires a persistence model instance');
    }
    this.model = model;
    this.retentionDays = retentionDays;
    this.clients = new Map();
    this.keepAliveMs = 30000;
    this.keepAliveInterval = setInterval(() => this.#sendKeepAlive(), this.keepAliveMs);
    if (this.keepAliveInterval.unref) this.keepAliveInterval.unref();
  }

  setRetentionDays(days) {
    if (!Number.isFinite(days) || days <= 0) return;
    this.retentionDays = Math.floor(days);
  }

  getRetentionCutoffIso(fromDate = new Date()) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const cutoff = new Date(fromDate.getTime() - this.retentionDays * msPerDay);
    return cutoff.toISOString();
  }

  async log(req, options = {}) {
    const {
      action,
      resourceType = null,
      resourceId = null,
      details = {},
      success = true,
      level = 'info',
      message = null,
      targetUserId = null,
      targetUserName = null,
      actorOverride = null
    } = options;

    if (!action) {
      console.warn('AuditLogger.log called without an action name');
      return null;
    }

    const actor = this.#resolveActor(req, actorOverride);
    const payload = {
      action,
      resourceType,
      resourceId,
      userId: actor.userId,
      userName: actor.userName,
      roles: actor.roles,
      ip: actor.ip,
      success: typeof success === 'boolean' ? success : Boolean(success),
      level,
      message,
      targetUserId,
      targetUserName,
      details: this.#sanitizeDetails(details)
    };

    try {
      const saved = await this.model.logAction(payload);
      this.emit('log', saved);
      this.#broadcast(saved);
      return saved;
    } catch (err) {
      console.error('AuditLogger failed to persist entry', err);
      return null;
    }
  }

  addStreamClient(req, res) {
    const clientId = uuidv4();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write('retry: 5000\n\n');
    this.clients.set(clientId, res);

    req.on('close', () => {
      this.clients.delete(clientId);
    });
    return clientId;
  }

  #broadcast(entry) {
    const payload = JSON.stringify(entry);
    for (const [clientId, res] of this.clients.entries()) {
      try {
        res.write(`data: ${payload}\n\n`);
      } catch (err) {
        console.warn('AuditLogger SSE client disconnected', err.message);
        this.clients.delete(clientId);
      }
    }
  }

  #sendKeepAlive() {
    if (this.clients.size === 0) return;
    for (const [clientId, res] of this.clients.entries()) {
      try {
        res.write(': keep-alive\n\n');
      } catch (err) {
        this.clients.delete(clientId);
      }
    }
  }

  #resolveActor(req, override) {
    const actor = {
      userId: null,
      userName: null,
      roles: [],
      ip: null
    };

    if (override) {
      actor.userId = override.userId || actor.userId;
      actor.userName = override.userName || actor.userName;
      actor.roles = Array.isArray(override.roles) ? override.roles : actor.roles;
      actor.ip = override.ip || actor.ip;
    }

    if (req) {
      const ip = this.#extractIp(req);
      if (ip) actor.ip = ip;
      if (req.user) {
        const candidateId =
          req.user.email ||
          req.user.preferred_username ||
          req.user.upn ||
          req.user.id ||
          req.user.sub ||
          null;
        actor.userId = override?.userId || candidateId || actor.userId;
        actor.userName =
          override?.userName ||
          req.user.name ||
          req.user.displayName ||
          actor.userName ||
          candidateId ||
          null;
        const rawRoles =
          override?.roles ||
          req.user.roles ||
          req.user.groups ||
          req.user.roles_claim ||
          [];
        actor.roles = Array.isArray(rawRoles) ? rawRoles : [rawRoles].filter(Boolean);
      }
    }
    return actor;
  }

  #extractIp(req) {
    const header = req.headers?.['x-forwarded-for'];
    if (header && typeof header === 'string') {
      return header.split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || null;
  }

  #sanitizeDetails(details, depth = 0) {
    if (details === null || details === undefined) return {};
    if (depth > 5) return '[truncated]';
    if (Array.isArray(details)) {
      const truncated = details.slice(0, ARRAY_TRUNCATE_AT).map(item =>
        this.#sanitizeDetails(item, depth + 1)
      );
      if (details.length > ARRAY_TRUNCATE_AT) truncated.push('[truncated]');
      return truncated;
    }
    if (typeof details === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(details)) {
        const lowered = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowered) || lowered.endsWith('password')) {
          result[key] = '[redacted]';
          continue;
        }
        result[key] = this.#sanitizeDetails(value, depth + 1);
      }
      return result;
    }
    if (typeof details === 'string') {
      if (details.length > STRING_TRUNCATE_AT) {
        return `${details.slice(0, STRING_TRUNCATE_AT)}…`;
      }
      return details;
    }
    return details;
  }
}

module.exports = AuditLogger;

