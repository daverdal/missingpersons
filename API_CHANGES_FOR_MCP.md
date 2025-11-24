# API Changes for MCP Server

This document tracks API changes that need to be reflected in the MCP server's tool manifests.

## Current API Endpoints (as of 2025-01-28)

### Applicant Search by Name
- **GET** `/api/applicants/search?name={name}`
  - Returns applicants matching the provided name (case-insensitive, partial match)
  - Parameters: `name` (string, required) - applicant name to search for (partial matches supported)
  - Response Format: `{ applicants: [{ applicant: {...}, referringOrg: {...}, lovedOnes: [...] }], count: N }`
  - Includes full applicant details with related lovedOnes and referringOrg
  - Limited to 50 results, ordered by name
  - MCP Tool: `missing.searchApplicantsByName` ⏳

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
  - Response Format: `{ photos: [{ filename, originalname, path, mimetype, size, type, uploadedBy, uploadedAt }] }`
  - Response Headers: Includes cache-control headers to prevent caching
  - Query: Returns photos where `f.type = 'photo' OR f.mimetype STARTS WITH 'image/'`, ordered by `uploadedAt DESC`
  - Permission Required: `missing.read` (any authenticated user)
  - MCP Tool: `missing.getLovedOnePhotos` ⏳

- **POST** `/api/loved-ones/:id/photos`
  - Uploads a photo for a LovedOne
  - Parameters: 
    - `id` (string, path parameter) - LovedOne ID
    - `photo` (file, multipart/form-data, field name: 'photo') - Image file (JPEG, PNG, GIF, max 10MB)
  - Response Format: `{ success: true, photo: { filename, originalname, path, mimetype, size, type, uploadedBy, uploadedAt } }`
  - Error Responses:
    - `400`: No file uploaded, file validation failed, or invalid file type
    - `403`: Forbidden - insufficient role (requires admin or case_worker)
    - `404`: LovedOne not found
    - `500`: Server error during upload
  - Permission Required: `missing.write` (admin or case_worker roles only)
  - MCP Tool: `missing.uploadLovedOnePhoto` ⏳
  - **Note**: File uploads require multipart/form-data. MCP server may need special handling for file uploads (consider base64 encoding or file path handling)

- **DELETE** `/api/loved-ones/:id/photos/:filename`
  - Deletes a photo for a LovedOne (also deletes the physical file from the uploads directory)
  - Parameters: 
    - `id` (string, path parameter) - LovedOne ID
    - `filename` (string, path parameter) - Photo filename
  - Response Format: `{ success: true }`
  - Error Responses:
    - `403`: Forbidden - insufficient role (requires admin or case_worker)
    - `404`: Photo not found
    - `500`: Server error during deletion
  - Permission Required: `missing.write` (admin or case_worker roles only)
  - MCP Tool: `missing.deleteLovedOnePhoto` ⏳
  - **Note**: This endpoint deletes both the File node in Neo4j and the physical file from the filesystem

---

## New Features to Add to MCP Server

Use this section to list features that have been added to the Missing Persons app but not yet reflected in the MCP server.

### Photo Management for Missing Persons

- **API Endpoint**: `GET /api/loved-ones/:id/photos`
- **Description**: Retrieve all photos associated with a specific missing person (LovedOne). Returns photos ordered by upload date (newest first). The query filters for files where `type = 'photo'` OR `mimetype` starts with `'image/'`.
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
- **Response Headers**: Includes `Cache-Control: no-store, no-cache, must-revalidate, private` to prevent caching
- **Permission Required**: `missing.read` (any authenticated user)
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
  - Output Schema: Object with `photos` array containing photo metadata objects (filename, originalname, path, mimetype, size, type, uploadedBy, uploadedAt)

- **API Endpoint**: `POST /api/loved-ones/:id/photos`
- **Description**: Upload a photo for a missing person (LovedOne). Accepts multipart/form-data with field name 'photo'. The file is validated to ensure it's an image type (JPEG, PNG, GIF) and stored in the uploads directory. A File node is created in Neo4j with a HAS_PHOTO relationship to the LovedOne.
- **Parameters**: 
  - `id` (string, required, path): LovedOne ID
  - `photo` (file, required, form-data, field name: 'photo'): Image file (JPEG, PNG, GIF, max 10MB)
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
- **Error Responses**:
  - `400 Bad Request`: No file uploaded, file validation failed, or invalid file type (not an image)
  - `403 Forbidden`: User does not have admin or case_worker role
  - `404 Not Found`: LovedOne with the specified ID does not exist
  - `500 Internal Server Error`: Server error during file processing or database operation
- **Permission Required**: `missing.write` (admin or case_worker roles only)
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
          "description": "Base64-encoded image data or file path (implementation depends on MCP server capabilities). The MCP server will need to convert this to multipart/form-data format for the API request."
        }
      }
    }
    ```
  - **Note**: File uploads in MCP may require special handling. The MCP server will need to:
    1. Accept base64-encoded image data or a file path
    2. Convert it to multipart/form-data format with field name 'photo'
    3. Set appropriate Content-Type header for multipart/form-data
    4. Handle file size limits (max 10MB)

- **API Endpoint**: `DELETE /api/loved-ones/:id/photos/:filename`
- **Description**: Delete a photo for a missing person (LovedOne). This deletes both the File node in Neo4j (and its HAS_PHOTO relationship) and the physical file from the uploads directory.
- **Parameters**: 
  - `id` (string, required, path): LovedOne ID
  - `filename` (string, required, path): Photo filename (as stored in the database, e.g., "1234567890-photo.jpg")
- **Response Format**: 
  ```json
  {
    "success": true
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: User does not have admin or case_worker role
  - `404 Not Found`: Photo with the specified filename not found for this LovedOne
  - `500 Internal Server Error`: Server error during deletion
- **Permission Required**: `missing.write` (admin or case_worker roles only)
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
          "description": "The filename of the photo to delete (as returned by GET /api/loved-ones/:id/photos, e.g., '1234567890-photo.jpg')"
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

