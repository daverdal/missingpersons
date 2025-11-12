const twilio = require('twilio');

let cachedClient = null;
let cachedSid = null;

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return null;
  }
  if (!cachedClient || cachedSid !== accountSid) {
    cachedClient = twilio(accountSid, authToken);
    cachedSid = accountSid;
  }
  return cachedClient;
}

function isConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

async function sendSms({ to, body }) {
  if (!isConfigured()) {
    throw new Error('Twilio credentials are not configured');
  }
  if (!to) throw new Error('Destination phone number is required');
  if (!body) throw new Error('SMS body is required');

  const client = getClient();
  if (!client) throw new Error('Twilio client could not be initialized');

  const payload = {
    to,
    body
  };

  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  } else {
    payload.from = process.env.TWILIO_FROM_NUMBER;
  }

  return client.messages.create(payload);
}

module.exports = {
  sendSms,
  isConfigured
};

