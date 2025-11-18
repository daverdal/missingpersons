const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

function normaliseText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n|\r|\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatAddress(entry) {
  if (!entry) return '';
  const name = entry.name ? entry.name.trim() : '';
  const address = entry.address || entry;
  if (name && address) return `${name} <${address}>`;
  return name || address || '';
}

async function fetchEmails(config, options = {}) {
  const {
    host,
    port = 993,
    secure = true,
    username,
    password,
    mailbox = 'INBOX'
  } = config || {};

  if (!host || !username || !password) {
    throw new Error('IMAP configuration is incomplete');
  }

  const limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 25, 100));

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user: username,
      pass: password
    },
    logger: false
  });

  const emails = [];

  try {
    await client.connect();
    const { exists = 0 } = await client.mailboxOpen(mailbox, { readOnly: true });

    if (!exists) {
      return [];
    }

    const startSeq = Math.max(1, exists - limit + 1);
    const range = `${startSeq}:*`;

    const fetchOptions = {
      seq: true,
      uid: true,
      envelope: true,
      internalDate: true,
      flags: true,
      source: true
    };

    for await (const message of client.fetch(range, fetchOptions)) {
      try {
        const parsed = await simpleParser(message.source);
        const textBody = normaliseText(parsed.text || '');
        const snippet = textBody ? textBody.slice(0, 240) : '';

        const from = parsed.from && parsed.from.value && parsed.from.value.length
          ? parsed.from.value.map(formatAddress).join(', ')
          : '';

        emails.push({
          uid: message.uid,
          subject: parsed.subject || '(no subject)',
          from,
          date: (parsed.date || message.internalDate || new Date()).toISOString(),
          snippet,
          text: textBody,
          html: parsed.html || null,
          flags: Array.isArray(message.flags) ? message.flags : []
        });
      } catch (parseErr) {
        console.error('[offender-news] failed to parse email message', parseErr);
      }
    }
  } finally {
    try {
      await client.logout();
    } catch (_) {
      // ignore logout errors
    }
  }

  return emails.sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = {
  fetchEmails
};




