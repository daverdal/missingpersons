# Testing Communication Routes

This guide helps you test the refactored communication routes (SMS and Email).

## Prerequisites

1. **Start the server**: `npm start`
2. **Login as admin** (communication routes require admin role)
3. **Ensure you have test data**:
   - For SMS: At least one Applicant with a phone number (`contact` field) and `smsOptIn = true`
   - For Email: At least one Applicant with an email address and `emailOptIn = true`

## Testing Methods

### Method 1: GUI Testing (Recommended)

#### 1. Test Email Settings

**Navigate to**: `http://localhost:3000/email-settings.html` (or click "Email Settings" from Settings page)

**Test GET /api/email-settings**:
- The page should load and display current email settings
- Check that both "stored" and "effective" settings are shown
- Verify the source indicator (database, offender_news_config, or environment)

**Test POST /api/email-settings**:
- Fill in the email settings form:
  - SMTP Host (e.g., `smtp.gmail.com`)
  - SMTP Port (e.g., `587`)
  - SMTP User (your email)
  - SMTP Password (your password or app password)
  - Email From (sender email)
  - Optional: Email From Name, Reply To
- Click "Save Settings"
- Verify success message appears
- Refresh the page and confirm settings are saved

#### 2. Test SMS Blast

**Navigate to**: `http://localhost:3000/sms-blast.html` (or click "Communications" → "SMS Blast")

**Prerequisites**:
- SMS service must be configured (Twilio credentials in `.env`)
- At least one Applicant with:
  - `contact` field populated (phone number)
  - `smsOptIn = true`

**Test POST /api/sms-blast**:
- Enter a test message (e.g., "This is a test SMS blast")
- Click "Send SMS Blast"
- Verify:
  - Success message with counts (total, sent, failed)
  - If no opted-in applicants: Error message with helpful details
  - If SMS service not configured: 503 error message

**Check Results**:
- Check the case timeline for the Applicant - should see a case event logged
- Verify SMS was actually sent (check Twilio console or recipient's phone)

#### 3. Test Email Blast

**Navigate to**: `http://localhost:3000/email-blast.html` (or click "Communications" → "Email Blast")

**Prerequisites**:
- Email settings must be configured (via email-settings.html or environment variables)
- At least one Applicant with:
  - `email` field populated
  - `emailOptIn = true`

**Test POST /api/email-blast**:
- Enter subject (e.g., "Test Email Blast")
- Enter message body
- Click "Send Email Blast"
- Verify:
  - Success message with `jobId`
  - Progress tracking starts automatically

**Test GET /api/email-blast/progress/:jobId**:
- After starting an email blast, the page should automatically poll for progress
- Verify progress updates show:
  - Total emails
  - Sent count
  - Failed count
  - Current progress
  - Status (starting → sending → completed)
- Check for any errors in the errors array

**Check Results**:
- Check recipient email inboxes
- Check the case timeline for Applicants - should see case events logged
- Verify daily email count tracking (should not exceed limit)

### Method 2: API Testing (Using Browser Console or Postman)

#### Test Email Settings

**GET /api/email-settings**:
```javascript
fetch('/api/email-settings', {
  headers: {
    'Authorization': `Bearer ${yourJwtToken}`
  }
})
.then(r => r.json())
.then(console.log);
```

**POST /api/email-settings**:
```javascript
fetch('/api/email-settings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${yourJwtToken}`
  },
  body: JSON.stringify({
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'your-email@gmail.com',
    smtpPass: 'your-app-password',
    emailFrom: 'your-email@gmail.com',
    emailFromName: 'Missing Persons App',
    emailReplyTo: 'reply@example.com'
  })
})
.then(r => r.json())
.then(console.log);
```

#### Test SMS Blast

**POST /api/sms-blast**:
```javascript
fetch('/api/sms-blast', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${yourJwtToken}`
  },
  body: JSON.stringify({
    message: 'Test SMS message'
  })
})
.then(r => r.json())
.then(console.log);
```

#### Test Email Blast

**POST /api/email-blast**:
```javascript
fetch('/api/email-blast', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${yourJwtToken}`
  },
  body: JSON.stringify({
    subject: 'Test Email Subject',
    message: 'Test email message body'
  })
})
.then(r => r.json())
.then(data => {
  console.log('Job ID:', data.jobId);
  // Use this jobId to check progress
});
```

**GET /api/email-blast/progress/:jobId**:
```javascript
const jobId = 'your-job-id-from-above';
fetch(`/api/email-blast/progress/${jobId}`, {
  headers: {
    'Authorization': `Bearer ${yourJwtToken}`
  }
})
.then(r => r.json())
.then(console.log);
```

## Expected Behaviors

### Email Settings
- ✅ GET returns both stored and effective settings
- ✅ POST saves settings and returns success
- ✅ Password is hidden in responses (shows `***hidden***`)
- ✅ Partial updates preserve existing values
- ✅ Port validation (1-65535)

### SMS Blast
- ✅ Only sends to applicants with `smsOptIn = true`
- ✅ Validates phone number format
- ✅ Logs case events for each sent SMS
- ✅ Returns detailed counts (total, sent, failed)
- ✅ Returns helpful error if no opted-in applicants

### Email Blast
- ✅ Only sends to applicants with `emailOptIn = true`
- ✅ Validates email addresses
- ✅ Tracks progress with jobId
- ✅ Respects daily email limit (default 400)
- ✅ Sends in batches with rate limiting
- ✅ Retries failed sends
- ✅ Logs case events for each sent email
- ✅ Progress endpoint returns current status

## Common Issues

### "SMS service is not configured"
- Check `.env` file has `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`
- Restart the server after adding credentials

### "Email service is not configured"
- Configure email settings via the GUI or environment variables
- Required: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

### "No applicants with phone numbers and SMS opt-in found"
- Check that Applicants have `contact` field populated
- Check that `smsOptIn = true` (not `null` or `false`)

### "No applicants with valid email addresses found"
- Check that Applicants have `email` field populated
- Check that `emailOptIn = true` (not `null` or `false`)
- Verify email format is valid

### "Daily email limit would be exceeded"
- Default limit is 400 emails per day
- Wait until next day or reduce batch size
- Check `EMAIL_DAILY_LIMIT` environment variable

## Verification Checklist

After testing, verify:
- [ ] Email settings can be retrieved and saved
- [ ] SMS blast sends to opted-in applicants only
- [ ] Email blast sends to opted-in applicants only
- [ ] Progress tracking works for email blasts
- [ ] Case events are logged for sent messages
- [ ] Error messages are helpful and informative
- [ ] Daily email limit is enforced
- [ ] No console errors in browser or server logs

