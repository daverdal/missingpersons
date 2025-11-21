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

## 2025-01-27

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

