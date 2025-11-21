# README.md

## Missing Persons Case Management App

This is a Node.js/Express/Neo4j app for managing cases of Missing and Murdered First Nations People, with Azure AD authentication, file uploads, event timeline, and admin controls.

### Prerequisites
- Node.js 18+
- Neo4j database (local or Aura)
- Azure AD tenant (for authentication)

### Setup
1. Copy `.env.example` to `.env` and fill in your values.
2. Run `npm install` to install dependencies.
3. Start the server:
   ```
   npm start
   ```
4. The API will be available at `http://localhost:3000` (or your configured port).

### Main Endpoints
- `POST /api/upload` — File upload (admin/case worker)
- `POST /api/cases/:caseId/events` — Add event to case (admin/case worker)
- `POST /api/cases/:caseId/sms` — Send an SMS update for a case (admin or assigned case worker)
- `GET /api/cases/:caseId/events` — List case events
- `GET /api/users` — List users (admin)
- `PUT /api/users/:email/roles` — Update user roles (admin)
- `POST /api/users/:email/promote` — Promote user to admin
- `POST /api/users/:email/demote` — Demote user to case worker
- `DELETE /api/users/:email` — Delete user
- `GET /api/audit-logs` — View audit logs (admin)

### Notes
- You must configure Azure AD and Neo4j connection in your `.env` file.
- Uploaded files are saved to the `uploads` folder.
- Audit logs are stored in Neo4j.

### Offender News (Gmail Inbox)
To enable the admin Offender News page, add these settings to `.env` for the mailbox you want to read:

```
OFFENDER_NEWS_EMAIL_IMAP_HOST=imap.gmail.com
OFFENDER_NEWS_EMAIL_IMAP_PORT=993
OFFENDER_NEWS_EMAIL_IMAP_SECURE=true
OFFENDER_NEWS_EMAIL_USERNAME=alerts@example.com
OFFENDER_NEWS_EMAIL_PASSWORD=your-app-password
OFFENDER_NEWS_EMAIL_FOLDER=INBOX
OFFENDER_NEWS_DEFAULT_LIMIT=25
```

If the mailbox uses Gmail with 2-Step Verification, generate an App Password and use it for `OFFENDER_NEWS_EMAIL_PASSWORD`. After updating `.env`, run `npm install` (installs `imapflow` and `mailparser`) and restart the server (`npm start`). The Offender News link is admin-only and shows the latest messages in the configured folder.

### SMS Notifications (Twilio Trial or Production)
1. Create/upgrade a Twilio account and provision an SMS-capable phone number (or Messaging Service).
2. Add the following environment variables (for example in `.env`):
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_FROM_NUMBER=+1XXXYYYZZZZ        # or use TWILIO_MESSAGING_SERVICE_SID=MG...
   ```
   During the Twilio trial you must also verify each destination number in the Twilio Console; trial messages are prefixed with “Sent from your Twilio trial account”.
3. Restart the Node server so the new variables load.
4. Call `POST /api/cases/:caseId/sms` with JSON like:
   ```json
   {
     "to": "+1XXXXXXXXXX",
     "message": "Short update for the family or case worker."
   }
   ```
   Only admins or case workers assigned to the case can send messages. Payload phone numbers must be in E.164 format (`+1...`).
5. Each successful send is logged as a `CaseEvent` (`type: sms`) so it appears in the case timeline.

If Twilio credentials are absent the endpoint returns `503` so the UI can disable SMS actions until configuration is complete.

---

## Tracking Changes for MCP Server

When adding new features or API endpoints to this app, please document them in:
- **CHANGELOG.md** - General changelog tracking all changes
- **API_CHANGES_FOR_MCP.md** - Specific API changes that need to be reflected in the MCP server

This helps ensure the MCP server's tool manifests stay up-to-date with new capabilities.

---

For questions or help, contact your developer or admin.
