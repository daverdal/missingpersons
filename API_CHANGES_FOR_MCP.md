# API Changes for MCP Server

This document tracks API changes that need to be reflected in the MCP server's tool manifests.

## Current API Endpoints (as of 2025-01-27)

### Province-Based Queries
- **GET** `/api/loved-ones/by-province?province={province}`
  - Returns missing persons (LovedOnes) for a specific province
  - Parameters: `province` (string) - province name or code (e.g., "Alberta", "AB")
  - MCP Tool: `missing.getLovedOnesByProvince` ✅

- **GET** `/api/applicants/by-province?province={province}`
  - Returns applicants/clients for a specific province
  - Parameters: `province` (string) - province name or code
  - MCP Tool: `missing.getApplicantsByProvince` ✅

### Communication Preferences
- **Fields**: `smsOptIn`, `emailOptIn` on Applicant nodes
  - Used to filter SMS and email blasts
  - NULL values are treated as opted-out

---

## New Features to Add to MCP Server

Use this section to list features that have been added to the Missing Persons app but not yet reflected in the MCP server.

### Template for New Features

```markdown
### Feature Name
- **API Endpoint**: `METHOD /api/endpoint`
- **Description**: What this endpoint does
- **Parameters**: 
  - `param1` (type): Description
  - `param2` (type): Description
- **Response Format**: Description of response structure
- **Permission Required**: `missing.read` | `missing.write` | `admin`
- **MCP Tool Needed**:
  - Tool ID: `missing.featureName`
  - Handler: `rest`
  - Input Schema: (describe required/optional params)
  - Output Schema: (describe response structure)
```

---

## Instructions for Updating MCP Server

1. Review entries in this document
2. Add new tool manifests to `c:\apps\mcp\tools\manifest\missing-persons.json`
3. Update NLU in `c:\apps\mcp\src\nlu\semantic.ts` if needed for new query patterns
4. Test the new tools through the MCP server's chat interface
5. Mark entries as ✅ when completed

