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

---

For questions or help, contact your developer or admin.
