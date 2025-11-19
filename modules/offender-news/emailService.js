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

// Detect bounce-back/delivery failure emails
function isBounceEmail(subject, from, textBody, parsed) {
  if (!subject && !from && !textBody) return false;
  
  const subjectLower = (subject || '').toLowerCase();
  const fromLower = (from || '').toLowerCase();
  const textLower = (textBody || '').toLowerCase();
  
  // Common bounce-back subject patterns
  const bounceSubjects = [
    'delivery status notification',
    'delivery failure',
    'undeliverable',
    'mail delivery failed',
    'mail delivery subsystem',
    'returned mail',
    'failure notice',
    'delivery notification',
    'message not delivered',
    'mail system error',
    'delivery error',
    'mailer-daemon',
    'postmaster',
    'mail delivery',
    'delivery problem',
    'message undeliverable',
    'bounce',
    'dsn',
    'non-delivery report',
    'noreply',
    'no-reply',
    'mailer daemon'
  ];
  
  // Check subject
  for (const pattern of bounceSubjects) {
    if (subjectLower.includes(pattern)) {
      return true;
    }
  }
  
  // Check from address (common bounce addresses)
  const bounceFromPatterns = [
    'mailer-daemon',
    'mailer daemon',
    'postmaster',
    'mail delivery',
    'mailer@',
    'noreply@',
    'no-reply@',
    'bounce@',
    'returned@',
    'undeliverable@'
  ];
  
  for (const pattern of bounceFromPatterns) {
    if (fromLower.includes(pattern)) {
      return true;
    }
  }
  
  // Check email headers for bounce indicators
  if (parsed && parsed.headers) {
    const headers = parsed.headers;
    const autoSubmitted = headers.get('auto-submitted');
    if (autoSubmitted && autoSubmitted.toLowerCase() === 'auto-generated') {
      // Check if it's a delivery notification
      if (subjectLower.includes('delivery') || subjectLower.includes('failure')) {
        return true;
      }
    }
    
    // Check return-path for mailer-daemon
    const returnPath = headers.get('return-path');
    if (returnPath) {
      const returnPathLower = returnPath.toLowerCase();
      if (returnPathLower.includes('mailer-daemon') || 
          returnPathLower.includes('postmaster') ||
          returnPathLower.includes('<>')) {
        return true;
      }
    }
  }
  
  // Check body content for common bounce messages
  const bounceBodyPatterns = [
    'delivery to the following recipient',
    'the following address',
    'permanent failure',
    'temporary failure',
    'could not be delivered',
    'was not delivered',
    'delivery has failed',
    'message could not be delivered',
    'this is an automatically generated',
    'original message follows',
    'returned to sender',
    'unrouteable address'
  ];
  
  for (const pattern of bounceBodyPatterns) {
    if (textLower.includes(pattern)) {
      return true;
    }
  }
  
  return false;
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

        const subject = parsed.subject || '(no subject)';
        
        // Filter out bounce-back/delivery failure emails
        if (isBounceEmail(subject, from, textBody, parsed)) {
          console.log('[offender-news] Skipping bounce-back email:', subject);
          continue; // Skip this email
        }

        emails.push({
          uid: message.uid,
          subject,
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




