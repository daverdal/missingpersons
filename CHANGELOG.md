# Missing Persons App - Changelog

This changelog tracks new features, API endpoints, and changes that need to be reflected in the MCP server's tool manifests.

## Format
Each entry should include:
- **Date**: When the change was made
- **Type**: `feature`, `api`, `bugfix`, `enhancement`
- **Description**: What was added/changed
- **API Endpoints**: New or modified endpoints
- **MCP Impact**: Whether this requires MCP server tool updates

---

## 2025-01-28

### Organization Contact Management
- **Type**: `feature`, `api`
- **Description**: Added ability to manage multiple contacts per organization. Each contact has a name, phone number, and email address. Organizations can now have multiple people associated with them, rather than just a single contact field.
- **API Endpoints**: 
  - `GET /api/organizations/:orgId/contacts` - Get all contacts for an organization
  - `POST /api/organizations/:orgId/contacts` - Create or update a contact (if `id` is provided, updates existing; otherwise creates new)
  - `DELETE /api/organizations/:orgId/contacts/:contactId` - Delete a contact
- **Database Changes**: 
  - New node type: `Contact` with properties: `id`, `name`, `phone`, `email`
  - New relationship: `(Organization)-[:HAS_CONTACT]->(Contact)`
  - Organizations now require an `id` field for contact management
- **MCP Impact**: 
  - [x] Requires new tool in MCP server
  - [ ] Requires modification to existing tool
  - [ ] No MCP impact
- **Tool Manifest Changes Needed**:
  - Tool ID: `missing.getOrganizationContacts` (GET contacts)
  - Tool ID: `missing.createOrganizationContact` or `missing.updateOrganizationContact` (POST contact)
  - Tool ID: `missing.deleteOrganizationContact` (DELETE contact)
  - Handler type: `rest`
  - Required parameters: `orgId` (organization ID), `contactId` (for delete/update), `name` (for create/update)
  - Permission scopes: `missing.read` (for GET), `missing.write` (for POST/DELETE, admin only)

## 2025-01-27

### Photo Management for Missing Persons (LovedOnes)
- **Type**: `feature`
- **Description**: Added ability to upload, view, and delete multiple photos for each missing person (LovedOne). Photos are stored as File nodes with a `HAS_PHOTO` relationship to LovedOne nodes. Each photo includes metadata (filename, originalname, mimetype, size, uploadedBy, uploadedAt) and a `type: 'photo'` field.
- **API Endpoints**: 
  - `GET /api/loved-ones/:id/photos` - Get all photos for a LovedOne
  - `POST /api/loved-ones/:id/photos` - Upload a photo for a LovedOne (multipart/form-data, field name: 'photo')
  - `DELETE /api/loved-ones/:id/photos/:filename` - Delete a photo for a LovedOne
- **MCP Impact**: 
  - [x] Requires new tool in MCP server
  - [ ] Requires modification to existing tool
  - [ ] No MCP impact
- **Tool Manifest Changes Needed**:
  - Tool ID: `missing.getLovedOnePhotos` (GET photos)
  - Tool ID: `missing.uploadLovedOnePhoto` (POST photo - may require special handling for file uploads)
  - Tool ID: `missing.deleteLovedOnePhoto` (DELETE photo)
  - Handler type: `rest`
  - Required parameters: `id` (LovedOne ID), `filename` (for delete)
  - Permission scopes: `missing.read` (for GET), `missing.write` (for POST/DELETE)
- **Database Changes**: 
  - New relationship type: `HAS_PHOTO` (LovedOne -> File)
  - File nodes now support `type: 'photo'` field to distinguish photos from other files

### Landing Page Setup
- **Type**: `feature`
- **Description**: Created landing page at `C:\apps\landing` that serves as the main portal for all AMC applications
- **API Endpoints**: N/A (separate service)
- **MCP Impact**: None

---

## Template for New Entries

```markdown
## YYYY-MM-DD

### Feature Name
- **Type**: `feature` | `api` | `bugfix` | `enhancement`
- **Description**: Brief description of what was added or changed
- **API Endpoints**: 
  - `GET /api/new-endpoint` - Description
  - `POST /api/another-endpoint` - Description
- **MCP Impact**: 
  - [ ] Requires new tool in MCP server
  - [ ] Requires modification to existing tool
  - [ ] No MCP impact
- **Tool Manifest Changes Needed**:
  - Tool ID: `missing.newFeature`
  - Handler type: `rest` | `neo4j`
  - Required parameters: `param1`, `param2`
  - Permission scopes: `missing.read` | `missing.write`
```

---

## How to Use This Changelog

1. **When adding a new feature**: Add an entry with all relevant details
2. **When updating the MCP server**: Review entries marked with "Requires new tool" or "Requires modification"
3. **When documenting API changes**: Include the full endpoint path, method, and parameters

## MCP Server Integration

When updating the MCP server, use this changelog to:
1. Identify new API endpoints that need tools
2. Understand parameter requirements
3. Determine permission scopes needed
4. Update tool manifests in `c:\apps\mcp\tools\manifest\missing-persons.json`

