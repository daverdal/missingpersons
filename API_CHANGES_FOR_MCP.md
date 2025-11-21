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

### Organization Contact Management
- **GET** `/api/organizations/:orgId/contacts`
  - Returns all contacts for a specific organization
  - Parameters: `orgId` (string, path parameter) - Organization ID
  - Response Format: `{ contacts: [{ id, name, phone, email }] }`
  - Permission Required: `missing.read` (any authenticated user)
  - MCP Tool: `missing.getOrganizationContacts` ⏳

- **POST** `/api/organizations/:orgId/contacts`
  - Creates or updates a contact for an organization
  - Parameters: 
    - `orgId` (string, path parameter) - Organization ID
    - `id` (string, optional) - Contact ID (if provided, updates existing contact)
    - `name` (string, required) - Contact name
    - `phone` (string, optional) - Contact phone number
    - `email` (string, optional) - Contact email address
  - Response Format: `{ success: true, contact: { id, name, phone, email } }`
  - Permission Required: `missing.write` (admin only)
  - MCP Tool: `missing.createOrganizationContact` or `missing.updateOrganizationContact` ⏳

- **DELETE** `/api/organizations/:orgId/contacts/:contactId`
  - Deletes a contact from an organization
  - Parameters: 
    - `orgId` (string, path parameter) - Organization ID
    - `contactId` (string, path parameter) - Contact ID
  - Response Format: `{ success: true }`
  - Permission Required: `missing.write` (admin only)
  - MCP Tool: `missing.deleteOrganizationContact` ⏳

### Photo Management for Missing Persons
- **GET** `/api/loved-ones/:id/photos`
  - Returns all photos for a specific LovedOne (missing person)
  - Parameters: `id` (string, path parameter) - LovedOne ID
  - Response: `{ photos: [{ filename, originalname, path, mimetype, size, type, uploadedBy, uploadedAt }] }`
  - Permission: `missing.read` (any authenticated user)
  - MCP Tool: `missing.getLovedOnePhotos` ⏳

- **POST** `/api/loved-ones/:id/photos`
  - Uploads a photo for a LovedOne
  - Parameters: 
    - `id` (string, path parameter) - LovedOne ID
    - `photo` (file, multipart/form-data) - Image file (JPEG, PNG, GIF)
  - Response: `{ success: true, photo: { filename, originalname, path, mimetype, size, type, uploadedBy, uploadedAt } }`
  - Permission: `missing.write` (admin or case_worker)
  - MCP Tool: `missing.uploadLovedOnePhoto` ⏳
  - **Note**: File uploads may require special handling in MCP server (multipart/form-data)

- **DELETE** `/api/loved-ones/:id/photos/:filename`
  - Deletes a photo for a LovedOne
  - Parameters: 
    - `id` (string, path parameter) - LovedOne ID
    - `filename` (string, path parameter) - Photo filename
  - Response: `{ success: true }`
  - Permission: `missing.write` (admin or case_worker)
  - MCP Tool: `missing.deleteLovedOnePhoto` ⏳

---

## New Features to Add to MCP Server

Use this section to list features that have been added to the Missing Persons app but not yet reflected in the MCP server.

### Photo Management for Missing Persons

- **API Endpoint**: `GET /api/loved-ones/:id/photos`
- **Description**: Retrieve all photos associated with a specific missing person (LovedOne)
- **Parameters**: 
  - `id` (string, required, path): LovedOne ID
- **Response Format**: 
  ```json
  {
    "photos": [
      {
        "filename": "1234567890-photo.jpg",
        "originalname": "photo.jpg",
        "path": "/path/to/uploads/1234567890-photo.jpg",
        "mimetype": "image/jpeg",
        "size": 123456,
        "type": "photo",
        "uploadedBy": "user@example.com",
        "uploadedAt": "2025-01-27T12:00:00.000Z"
      }
    ]
  }
  ```
- **Permission Required**: `missing.read`
- **MCP Tool Needed**:
  - Tool ID: `missing.getLovedOnePhotos`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": {
          "type": "string",
          "description": "The LovedOne ID"
        }
      }
    }
    ```
  - Output Schema: Array of photo objects with metadata

- **API Endpoint**: `POST /api/loved-ones/:id/photos`
- **Description**: Upload a photo for a missing person (LovedOne). Accepts multipart/form-data with field name 'photo'.
- **Parameters**: 
  - `id` (string, required, path): LovedOne ID
  - `photo` (file, required, form-data): Image file (JPEG, PNG, GIF, max 10MB)
- **Response Format**: 
  ```json
  {
    "success": true,
    "photo": {
      "filename": "1234567890-photo.jpg",
      "originalname": "photo.jpg",
      "path": "/path/to/uploads/1234567890-photo.jpg",
      "mimetype": "image/jpeg",
      "size": 123456,
      "type": "photo",
      "uploadedBy": "user@example.com",
      "uploadedAt": "2025-01-27T12:00:00.000Z"
    }
  }
  ```
- **Permission Required**: `missing.write` (admin or case_worker)
- **MCP Tool Needed**:
  - Tool ID: `missing.uploadLovedOnePhoto`
  - Handler: `rest` (may require special handling for multipart/form-data file uploads)
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["id", "photo"],
      "properties": {
        "id": {
          "type": "string",
          "description": "The LovedOne ID"
        },
        "photo": {
          "type": "string",
          "description": "Base64-encoded image data or file path (implementation depends on MCP server capabilities)"
        }
      }
    }
    ```
  - **Note**: File uploads in MCP may require special handling. Consider if the MCP server can handle multipart/form-data or if base64 encoding is needed.

- **API Endpoint**: `DELETE /api/loved-ones/:id/photos/:filename`
- **Description**: Delete a photo for a missing person (LovedOne)
- **Parameters**: 
  - `id` (string, required, path): LovedOne ID
  - `filename` (string, required, path): Photo filename
- **Response Format**: 
  ```json
  {
    "success": true
  }
  ```
- **Permission Required**: `missing.write` (admin or case_worker)
- **MCP Tool Needed**:
  - Tool ID: `missing.deleteLovedOnePhoto`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["id", "filename"],
      "properties": {
        "id": {
          "type": "string",
          "description": "The LovedOne ID"
        },
        "filename": {
          "type": "string",
          "description": "The filename of the photo to delete"
        }
      }
    }
    ```

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

