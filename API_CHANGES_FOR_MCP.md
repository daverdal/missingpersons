# API Changes for MCP Server

This document tracks API changes that need to be reflected in the MCP server's tool manifests.

## Current API Endpoints (as of 2025-01-28)

### Public-Facing Endpoints (No Authentication Required)

These endpoints are used by the public-facing website and do not require authentication:

- **GET** `/api/public/loved-ones`
  - Returns a public-safe list of missing loved ones (LovedOnes) that are still considered missing
  - Filters out resolved statuses by default (Found Safe, Found Deceased, Case Closed, Voluntary Return)
  - Parameters: 
    - `community` (string, optional): Filter by community name (partial match)
    - `province` (string, optional): Filter by province code (e.g., "MB", "AB")
    - `status` (string, optional): Filter by specific status (if provided, overrides default filtering)
    - `search` (string, optional): Search in name, lastLocation, or community (partial match)
    - `limit` (number, optional): Maximum results (default: 50, max: 200)
  - Response Format: `{ results: [{ id, name, community, province, lastLocation, dateOfIncident, status, relationship, coordinates, summary, photoUrl, familyContactInitials }] }`
  - Note: This endpoint is used by the public website at `http://192.168.2.27:4000`

- **POST** `/api/public/contact`
  - Accepts contact form submissions from the public website
  - Creates a `PublicInquiry` node in Neo4j
  - Parameters (body):
    - `fullName` (string, required): Submitter's full name
    - `email` (string, required): Valid email address
    - `phone` (string, optional): Phone number
    - `community` (string, optional): Community or location
    - `preferredContactMethod` (string, optional): "phone", "email", "text", or empty
    - `message` (string, required): Inquiry message (max 2000 characters)
  - Response Format: `{ success: true, message: "Inquiry received. A case worker will reach out shortly." }`
  - Note: Submissions can be viewed by admins/case_workers via `GET /api/public/inquiries`

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

### LovedOne Queries
- **GET** `/api/loved-ones/all`
  - Returns all missing persons (LovedOnes) without requiring a community filter
  - Useful for dropdowns and general queries where you need all loved ones
  - Parameters: None
  - Response Format: `{ lovedOnes: [{ id, name, community, province, lastLocation, dateOfIncident, status, ... }] }`
  - Permission Required: `missing.read` (admin or case_worker roles only)
  - MCP Tool: `missing.getAllLovedOnes` ⏳

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

### Public Contact Inquiries Management

- **API Endpoint**: `GET /api/public/inquiries`
- **Description**: Retrieve all public contact form submissions from the public-facing website. These are inquiries submitted by potential applicants through the public contact form. Returns inquiries ordered by creation date (newest first).
- **Parameters**: 
  - `status` (string, optional, query): Filter inquiries by status. Valid values: "new", "contacted", "in_progress", "resolved", "closed". If not provided, returns all inquiries.
  - `limit` (number, optional, query): Maximum number of results to return (default: 100, max: 500)
- **Response Format**: 
  ```json
  {
    "results": [
      {
        "id": "uuid",
        "fullName": "John Doe",
        "email": "john@example.com",
        "phone": "204-555-0100",
        "community": "Sagkeeng First Nation",
        "preferredContactMethod": "email",
        "message": "I need help finding my missing loved one...",
        "source": "public_form",
        "status": "new",
        "createdAt": "2025-01-28T12:00:00.000Z",
        "ipAddress": "192.168.1.1"
      }
    ]
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: User does not have admin or case_worker role
  - `500 Internal Server Error`: Server error during database query
- **Permission Required**: `missing.read` (admin or case_worker roles only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getPublicInquiries`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["new", "contacted", "in_progress", "resolved", "closed"],
          "description": "Optional filter by inquiry status"
        },
        "limit": {
          "type": "number",
          "minimum": 1,
          "maximum": 500,
          "description": "Maximum number of results (default: 100)"
        }
      }
    }
    ```
  - Output Schema: Object with `results` array containing inquiry objects (id, fullName, email, phone, community, preferredContactMethod, message, source, status, createdAt, ipAddress)

- **API Endpoint**: `PUT /api/public/inquiries/:id/status`
- **Description**: Update the status of a public contact inquiry. This allows case workers to track the progress of inquiries (e.g., mark as "contacted" after reaching out, "resolved" when completed).
- **Parameters**: 
  - `id` (string, required, path): Public inquiry ID (UUID)
  - `status` (string, required, body): New status value. Valid values: "new", "contacted", "in_progress", "resolved", "closed"
- **Request Body Format**: 
  ```json
  {
    "status": "contacted"
  }
  ```
- **Response Format**: 
  ```json
  {
    "success": true,
    "inquiry": {
      "id": "uuid",
      "fullName": "John Doe",
      "email": "john@example.com",
      "phone": "204-555-0100",
      "community": "Sagkeeng First Nation",
      "preferredContactMethod": "email",
      "message": "I need help finding my missing loved one...",
      "source": "public_form",
      "status": "contacted",
      "createdAt": "2025-01-28T12:00:00.000Z",
      "ipAddress": "192.168.1.1"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Status parameter is missing or invalid
  - `403 Forbidden`: User does not have admin or case_worker role
  - `404 Not Found`: Public inquiry with the specified ID does not exist
  - `500 Internal Server Error`: Server error during database update
- **Permission Required**: `missing.write` (admin or case_worker roles only)
- **MCP Tool Needed**:
  - Tool ID: `missing.updatePublicInquiryStatus`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["id", "status"],
      "properties": {
        "id": {
          "type": "string",
          "description": "The public inquiry ID (UUID)"
        },
        "status": {
          "type": "string",
          "enum": ["new", "contacted", "in_progress", "resolved", "closed"],
          "description": "The new status for the inquiry"
        }
      }
    }
    ```
  - Output Schema: Object with `success` boolean and `inquiry` object containing the updated inquiry data

**Note**: Public inquiries are created when users submit the contact form on the public-facing website (`http://192.168.2.27:4000`). They are stored as `PublicInquiry` nodes in Neo4j with properties: id, fullName, email, phone, community, preferredContactMethod, message, source, status, createdAt, ipAddress.

### Get All Loved Ones (No Community Filter)

- **API Endpoint**: `GET /api/loved-ones/all`
- **Description**: Retrieve all missing persons (LovedOnes) without requiring a community filter. This endpoint is useful for dropdowns, general queries, and features like Witness Management where you need to select from all loved ones regardless of community.
- **Parameters**: None (no query parameters required)
- **Response Format**: 
  ```json
  {
    "lovedOnes": [
      {
        "id": "LO123",
        "name": "John Doe",
        "community": "Sagkeeng First Nation",
        "province": "MB",
        "lastLocation": "Winnipeg",
        "dateOfIncident": "2025-01-15",
        "status": "Active",
        ...
      }
    ]
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: User does not have admin or case_worker role
  - `500 Internal Server Error`: Server error during database query
- **Permission Required**: `missing.read` (admin or case_worker roles only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getAllLovedOnes`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {}
    }
    ```
  - Output Schema: Object with `lovedOnes` array containing all LovedOne objects (id, name, community, province, lastLocation, dateOfIncident, status, and other properties)
  - **Note**: This endpoint returns all loved ones ordered by name. Unlike `/api/loved-ones?community={community}`, this endpoint does not require a community parameter, making it suitable for general-purpose queries and dropdown population.

### Witness Management

Witness Management allows caseworkers to record and track witness statements related to cases or missing persons. Witnesses can be linked to either a case (Applicant) or a missing person (LovedOne), and are automatically assigned to the logged-in caseworker.

- **API Endpoint**: `GET /api/witnesses`
- **Description**: Retrieve all witnesses with optional filters. Returns witnesses ordered by date of statement (newest first).
- **Parameters** (query):
  - `relatedToType` (string, optional): Filter by relationship type - "case" or "lovedOne"
  - `relatedToId` (string, optional): Filter by specific case ID or LovedOne ID
  - `reportedTo` (string, optional): Filter by caseworker email who took the statement
  - `createdBy` (string, optional): Filter by creator email
- **Response Format**: 
  ```json
  {
    "witnesses": [
      {
        "witnessId": "uuid",
        "name": "John Smith",
        "contact": "204-555-0100",
        "address": "123 Main St, Winnipeg, MB",
        "statement": "I saw the person at the gas station...",
        "dateOfStatement": "2025-01-28T10:00:00.000Z",
        "relatedToType": "lovedOne",
        "relatedToId": "LO123",
        "reportedTo": "caseworker@example.com",
        "createdBy": "caseworker@example.com",
        "createdAt": "2025-01-28T10:00:00.000Z",
        "updatedAt": "2025-01-28T10:00:00.000Z",
        "metadata": null,
        "relatedTo": {
          "type": "lovedOne",
          "name": "Jane Doe",
          "id": "LO123"
        },
        "reportedToUser": {
          "email": "caseworker@example.com",
          "name": "Case Worker Name"
        }
      }
    ]
  }
  ```
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getWitnesses`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {
        "relatedToType": {
          "type": "string",
          "enum": ["case", "lovedOne"],
          "description": "Filter by relationship type"
        },
        "relatedToId": {
          "type": "string",
          "description": "Filter by case ID or LovedOne ID"
        },
        "reportedTo": {
          "type": "string",
          "description": "Filter by caseworker email"
        },
        "createdBy": {
          "type": "string",
          "description": "Filter by creator email"
        }
      }
    }
    ```
  - Output Schema: Object with `witnesses` array containing witness objects with full details including related case/lovedOne and reportedTo user info

- **API Endpoint**: `GET /api/witnesses/:witnessId`
- **Description**: Retrieve a specific witness by ID.
- **Parameters**: 
  - `witnessId` (string, required, path): Witness UUID
- **Response Format**: 
  ```json
  {
    "witness": {
      "witnessId": "uuid",
      "name": "John Smith",
      "contact": "204-555-0100",
      "address": "123 Main St, Winnipeg, MB",
      "statement": "I saw the person at the gas station...",
      "dateOfStatement": "2025-01-28T10:00:00.000Z",
      "relatedToType": "lovedOne",
      "relatedToId": "LO123",
      "reportedTo": "caseworker@example.com",
      "createdBy": "caseworker@example.com",
      "createdAt": "2025-01-28T10:00:00.000Z",
      "updatedAt": "2025-01-28T10:00:00.000Z",
      "metadata": null,
      "relatedTo": {
        "type": "lovedOne",
        "name": "Jane Doe",
        "id": "LO123"
      },
      "reportedToUser": {
        "email": "caseworker@example.com",
        "name": "Case Worker Name"
      }
    }
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Witness not found
  - `500 Internal Server Error`: Server error during database query
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getWitnessById`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["witnessId"],
      "properties": {
        "witnessId": {
          "type": "string",
          "description": "The witness UUID"
        }
      }
    }
    ```
  - Output Schema: Object with `witness` containing full witness details

- **API Endpoint**: `POST /api/witnesses`
- **Description**: Create a new witness record. The `reportedTo` field is automatically set to the logged-in user if not provided.
- **Parameters** (body):
  - `name` (string, required): Witness name
  - `contact` (string, optional): Phone number or email
  - `address` (string, optional): Physical address
  - `statement` (string, optional): Witness statement/notes
  - `dateOfStatement` (string, optional): ISO date string (defaults to current date)
  - `relatedToType` (string, optional): "case" or "lovedOne"
  - `relatedToId` (string, optional): Case ID or LovedOne ID
  - `reportedTo` (string, optional): Caseworker email (auto-set to logged-in user if not provided)
  - `metadata` (object, optional): Additional flexible data
- **Response Format**: 
  ```json
  {
    "witness": {
      "witnessId": "uuid",
      "name": "John Smith",
      "contact": "204-555-0100",
      "address": "123 Main St, Winnipeg, MB",
      "statement": "I saw the person at the gas station...",
      "dateOfStatement": "2025-01-28T10:00:00.000Z",
      "relatedToType": "lovedOne",
      "relatedToId": "LO123",
      "reportedTo": "caseworker@example.com",
      "createdBy": "caseworker@example.com",
      "createdAt": "2025-01-28T10:00:00.000Z",
      "updatedAt": "2025-01-28T10:00:00.000Z",
      "metadata": null
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Name is required
  - `500 Internal Server Error`: Server error during creation
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.createWitness`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": {
          "type": "string",
          "description": "Witness name (required)"
        },
        "contact": {
          "type": "string",
          "description": "Phone number or email"
        },
        "address": {
          "type": "string",
          "description": "Physical address"
        },
        "statement": {
          "type": "string",
          "description": "Witness statement or notes"
        },
        "dateOfStatement": {
          "type": "string",
          "description": "ISO date string when statement was taken"
        },
        "relatedToType": {
          "type": "string",
          "enum": ["case", "lovedOne"],
          "description": "Type of entity this witness is related to"
        },
        "relatedToId": {
          "type": "string",
          "description": "Case ID or LovedOne ID"
        },
        "reportedTo": {
          "type": "string",
          "description": "Caseworker email (auto-set to logged-in user if not provided)"
        },
        "metadata": {
          "type": "object",
          "description": "Additional flexible data"
        }
      }
    }
    ```
  - Output Schema: Object with `witness` containing the created witness data

- **API Endpoint**: `PUT /api/witnesses/:witnessId`
- **Description**: Update an existing witness record. Only provided fields will be updated.
- **Parameters**: 
  - `witnessId` (string, required, path): Witness UUID
  - Body: Same fields as POST (all optional except those being updated)
- **Response Format**: Same as GET by ID
- **Error Responses**:
  - `404 Not Found`: Witness not found
  - `500 Internal Server Error`: Server error during update
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.updateWitness`
  - Handler: `rest`
  - Input Schema: Same as createWitness but with `witnessId` as path parameter
  - Output Schema: Object with `witness` containing updated witness data

- **API Endpoint**: `DELETE /api/witnesses/:witnessId`
- **Description**: Delete a witness record and all its relationships.
- **Parameters**: 
  - `witnessId` (string, required, path): Witness UUID
- **Response Format**: 
  ```json
  {
    "success": true
  }
  ```
- **Error Responses**:
  - `500 Internal Server Error`: Server error during deletion
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.deleteWitness`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["witnessId"],
      "properties": {
        "witnessId": {
          "type": "string",
          "description": "The witness UUID to delete"
        }
      }
    }
    ```
  - Output Schema: Object with `success` boolean

**Note**: Witnesses are stored as `Witness` nodes in Neo4j with relationships:
- `WITNESSED` → `Applicant` (if related to a case)
- `WITNESSED` → `LovedOne` (if related to a missing person)
- `REPORTED_TO` → `User` (caseworker who took the statement)

### Timeline Events Management

Timeline Events track significant occurrences related to missing persons (LovedOnes), such as sightings, tips, status changes, and case notes. Events are automatically created for certain actions (e.g., "CaseOpened" when a LovedOne is created).

- **API Endpoint**: `GET /api/timeline/events`
- **Description**: Retrieve all timeline events (global timeline view). Supports filtering by event type, date range, community, and active cases.
- **Parameters** (query):
  - `eventType` (string, optional): Filter by event type (e.g., "Sighting", "TipReceived", "StatusChanged")
  - `startDate` (string, optional): ISO date string - filter events from this date
  - `endDate` (string, optional): ISO date string - filter events until this date
  - `community` (string, optional): Filter by community name
  - `activeOnly` (boolean, optional): Show only events for active cases
  - `limit` (number, optional): Maximum number of results
- **Response Format**: 
  ```json
  {
    "events": [
      {
        "eventId": "uuid",
        "lovedOneId": "LO123",
        "lovedOneName": "Jane Doe",
        "eventType": "Sighting",
        "timestamp": "2025-01-28T10:00:00.000Z",
        "description": "Witness reported seeing person at gas station",
        "createdBy": "caseworker@example.com",
        "location": "Winnipeg, MB",
        "metadata": {}
      }
    ]
  }
  ```
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getTimelineEvents`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {
        "eventType": {
          "type": "string",
          "description": "Filter by event type"
        },
        "startDate": {
          "type": "string",
          "description": "ISO date string - filter from this date"
        },
        "endDate": {
          "type": "string",
          "description": "ISO date string - filter until this date"
        },
        "community": {
          "type": "string",
          "description": "Filter by community name"
        },
        "activeOnly": {
          "type": "boolean",
          "description": "Show only events for active cases"
        },
        "limit": {
          "type": "number",
          "description": "Maximum number of results"
        }
      }
    }
    ```
  - Output Schema: Object with `events` array containing timeline event objects

- **API Endpoint**: `GET /api/timeline/loved-ones/:lovedOneId/events`
- **Description**: Retrieve all timeline events for a specific missing person (LovedOne).
- **Parameters**: 
  - `lovedOneId` (string, required, path): LovedOne ID
- **Response Format**: Same as GET all events, but filtered to one LovedOne
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getLovedOneTimelineEvents`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["lovedOneId"],
      "properties": {
        "lovedOneId": {
          "type": "string",
          "description": "The LovedOne ID"
        }
      }
    }
    ```
  - Output Schema: Object with `events` array containing timeline events for the specified LovedOne

- **API Endpoint**: `POST /api/timeline/loved-ones/:lovedOneId/events`
- **Description**: Create a new timeline event for a missing person.
- **Parameters**: 
  - `lovedOneId` (string, required, path): LovedOne ID
  - Body:
    - `eventType` (string, required): Event type (e.g., "Sighting", "TipReceived", "StatusChanged", "NoteAdded", "SearchDispatched", "Found", "CaseClosed")
    - `description` (string, required): Event description/details
    - `timestamp` (string, optional): ISO date string (defaults to current time)
    - `location` (string, optional): Location where event occurred
    - `metadata` (object, optional): Additional flexible data
- **Response Format**: 
  ```json
  {
    "event": {
      "eventId": "uuid",
      "lovedOneId": "LO123",
      "eventType": "Sighting",
      "timestamp": "2025-01-28T10:00:00.000Z",
      "description": "Witness reported seeing person at gas station",
      "createdBy": "caseworker@example.com",
      "location": "Winnipeg, MB",
      "metadata": {}
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields or invalid event type
  - `404 Not Found`: LovedOne not found
  - `500 Internal Server Error`: Server error during creation
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.createTimelineEvent`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["lovedOneId", "eventType", "description"],
      "properties": {
        "lovedOneId": {
          "type": "string",
          "description": "The LovedOne ID"
        },
        "eventType": {
          "type": "string",
          "enum": ["CaseOpened", "MissingReported", "LastSeen", "Sighting", "TipReceived", "StatusChanged", "SearchDispatched", "NoteAdded", "Found", "CaseClosed"],
          "description": "Type of timeline event"
        },
        "description": {
          "type": "string",
          "description": "Event description/details (required)"
        },
        "timestamp": {
          "type": "string",
          "description": "ISO date string (defaults to current time)"
        },
        "location": {
          "type": "string",
          "description": "Location where event occurred"
        },
        "metadata": {
          "type": "object",
          "description": "Additional flexible data"
        }
      }
    }
    ```
  - Output Schema: Object with `event` containing the created timeline event

- **API Endpoint**: `PUT /api/timeline/events/:eventId`
- **Description**: Update an existing timeline event.
- **Parameters**: 
  - `eventId` (string, required, path): Event UUID
  - Body: Same fields as POST (all optional)
- **Response Format**: Same as POST
- **Error Responses**:
  - `404 Not Found`: Event not found
  - `500 Internal Server Error`: Server error during update
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.updateTimelineEvent`
  - Handler: `rest`
  - Input Schema: Same as createTimelineEvent but with `eventId` as path parameter
  - Output Schema: Object with `event` containing updated event data

- **API Endpoint**: `DELETE /api/timeline/events/:eventId`
- **Description**: Delete a timeline event.
- **Parameters**: 
  - `eventId` (string, required, path): Event UUID
- **Response Format**: 
  ```json
  {
    "success": true
  }
  ```
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.deleteTimelineEvent`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["eventId"],
      "properties": {
        "eventId": {
          "type": "string",
          "description": "The event UUID to delete"
        }
      }
    }
    ```
  - Output Schema: Object with `success` boolean

**Note**: Timeline events are stored as `TimelineEvent` nodes in Neo4j with a `FOR_LOVEDONE` relationship to `LovedOne` nodes. Common event types include: CaseOpened, MissingReported, LastSeen, Sighting, TipReceived, StatusChanged, SearchDispatched, NoteAdded, Found, CaseClosed.

### Reminders Management

Reminders allow caseworkers to schedule follow-up tasks related to cases or missing persons. Reminders can be assigned to specific users and filtered by priority, completion status, and due date.

- **API Endpoint**: `GET /api/reminders`
- **Description**: Retrieve all reminders with optional filters. Returns reminders sorted by creation date (newest first).
- **Parameters** (query):
  - `assignedTo` (string, optional): Filter by assigned user email
  - `relatedToType` (string, optional): Filter by "case" or "lovedOne"
  - `relatedToId` (string, optional): Filter by case ID or LovedOne ID
  - `priority` (string, optional): Filter by priority ("low", "medium", "high", "urgent")
  - `completed` (boolean, optional): Filter by completion status
  - `overdue` (boolean, optional): Show only overdue reminders
  - `upcoming` (boolean, optional): Show only upcoming reminders (next 7 days)
- **Response Format**: 
  ```json
  {
    "reminders": [
      {
        "reminderId": "uuid",
        "title": "Follow up with witness",
        "description": "Call John Smith about his statement",
        "dueDate": "2025-02-01T10:00:00.000Z",
        "priority": "high",
        "completed": false,
        "assignedTo": "caseworker@example.com",
        "relatedToType": "lovedOne",
        "relatedToId": "LO123",
        "createdBy": "caseworker@example.com",
        "createdAt": "2025-01-28T10:00:00.000Z",
        "updatedAt": "2025-01-28T10:00:00.000Z"
      }
    ]
  }
  ```
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getReminders`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {
        "assignedTo": {
          "type": "string",
          "description": "Filter by assigned user email"
        },
        "relatedToType": {
          "type": "string",
          "enum": ["case", "lovedOne"],
          "description": "Filter by relationship type"
        },
        "relatedToId": {
          "type": "string",
          "description": "Filter by case ID or LovedOne ID"
        },
        "priority": {
          "type": "string",
          "enum": ["low", "medium", "high", "urgent"],
          "description": "Filter by priority level"
        },
        "completed": {
          "type": "boolean",
          "description": "Filter by completion status"
        },
        "overdue": {
          "type": "boolean",
          "description": "Show only overdue reminders"
        },
        "upcoming": {
          "type": "boolean",
          "description": "Show only upcoming reminders (next 7 days)"
        }
      }
    }
    ```
  - Output Schema: Object with `reminders` array containing reminder objects

- **API Endpoint**: `GET /api/reminders/upcoming`
- **Description**: Retrieve upcoming reminders (next 7 days by default). Shows all upcoming reminders regardless of assignment.
- **Parameters** (query):
  - `days` (number, optional): Number of days ahead to look (default: 7)
- **Response Format**: Same as GET all reminders, but filtered to upcoming dates
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getUpcomingReminders`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {
        "days": {
          "type": "number",
          "description": "Number of days ahead to look (default: 7)"
        }
      }
    }
    ```
  - Output Schema: Object with `reminders` array containing upcoming reminders

- **API Endpoint**: `GET /api/reminders/:reminderId`
- **Description**: Retrieve a specific reminder by ID.
- **Parameters**: 
  - `reminderId` (string, required, path): Reminder UUID
- **Response Format**: 
  ```json
  {
    "reminder": {
      "reminderId": "uuid",
      "title": "Follow up with witness",
      "description": "Call John Smith about his statement",
      "dueDate": "2025-02-01T10:00:00.000Z",
      "priority": "high",
      "completed": false,
      "assignedTo": "caseworker@example.com",
      "relatedToType": "lovedOne",
      "relatedToId": "LO123",
      "createdBy": "caseworker@example.com",
      "createdAt": "2025-01-28T10:00:00.000Z",
      "updatedAt": "2025-01-28T10:00:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Reminder not found
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getReminderById`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["reminderId"],
      "properties": {
        "reminderId": {
          "type": "string",
          "description": "The reminder UUID"
        }
      }
    }
    ```
  - Output Schema: Object with `reminder` containing full reminder details

- **API Endpoint**: `POST /api/reminders`
- **Description**: Create a new reminder. Any logged-in user can create reminders for any case or missing person.
- **Parameters** (body):
  - `title` (string, required): Reminder title
  - `description` (string, optional): Detailed description
  - `dueDate` (string, required): ISO date string for when reminder is due
  - `priority` (string, optional): Priority level ("low", "medium", "high", "urgent", default: "medium")
  - `assignedTo` (string, optional): User email to assign reminder to (defaults to creator)
  - `relatedToType` (string, optional): "case" or "lovedOne"
  - `relatedToId` (string, optional): Case ID or LovedOne ID
- **Response Format**: 
  ```json
  {
    "reminder": {
      "reminderId": "uuid",
      "title": "Follow up with witness",
      "description": "Call John Smith about his statement",
      "dueDate": "2025-02-01T10:00:00.000Z",
      "priority": "high",
      "completed": false,
      "assignedTo": "caseworker@example.com",
      "relatedToType": "lovedOne",
      "relatedToId": "LO123",
      "createdBy": "caseworker@example.com",
      "createdAt": "2025-01-28T10:00:00.000Z",
      "updatedAt": "2025-01-28T10:00:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields (title, dueDate)
  - `500 Internal Server Error`: Server error during creation
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.createReminder`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["title", "dueDate"],
      "properties": {
        "title": {
          "type": "string",
          "description": "Reminder title (required)"
        },
        "description": {
          "type": "string",
          "description": "Detailed description"
        },
        "dueDate": {
          "type": "string",
          "description": "ISO date string for when reminder is due (required)"
        },
        "priority": {
          "type": "string",
          "enum": ["low", "medium", "high", "urgent"],
          "description": "Priority level (default: medium)"
        },
        "assignedTo": {
          "type": "string",
          "description": "User email to assign reminder to (defaults to creator)"
        },
        "relatedToType": {
          "type": "string",
          "enum": ["case", "lovedOne"],
          "description": "Type of entity this reminder is related to"
        },
        "relatedToId": {
          "type": "string",
          "description": "Case ID or LovedOne ID"
        }
      }
    }
    ```
  - Output Schema: Object with `reminder` containing the created reminder data

- **API Endpoint**: `PUT /api/reminders/:reminderId`
- **Description**: Update an existing reminder (e.g., mark as completed, change due date).
- **Parameters**: 
  - `reminderId` (string, required, path): Reminder UUID
  - Body: Same fields as POST (all optional)
- **Response Format**: Same as GET by ID
- **Error Responses**:
  - `404 Not Found`: Reminder not found
  - `500 Internal Server Error`: Server error during update
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.updateReminder`
  - Handler: `rest`
  - Input Schema: Same as createReminder but with `reminderId` as path parameter
  - Output Schema: Object with `reminder` containing updated reminder data

- **API Endpoint**: `DELETE /api/reminders/:reminderId`
- **Description**: Delete a reminder.
- **Parameters**: 
  - `reminderId` (string, required, path): Reminder UUID
- **Response Format**: 
  ```json
  {
    "success": true
  }
  ```
- **Permission Required**: `missing.write` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.deleteReminder`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["reminderId"],
      "properties": {
        "reminderId": {
          "type": "string",
          "description": "The reminder UUID to delete"
        }
      }
    }
    ```
  - Output Schema: Object with `success` boolean

**Note**: Reminders are stored as `Reminder` nodes in Neo4j with relationships:
- `RELATED_TO` → `Applicant` (if related to a case)
- `RELATED_TO` → `LovedOne` (if related to a missing person)
- `ASSIGNED_TO` → `User` (assigned caseworker)

### Dashboard Statistics

The Dashboard provides aggregated statistics and recent activity for caseworkers to get an overview of the system.

- **API Endpoint**: `GET /api/dashboard/stats`
- **Description**: Retrieve aggregated dashboard statistics including case counts, missing person counts, reminder statistics, recent timeline events, and upcoming reminders.
- **Parameters**: None
- **Response Format**: 
  ```json
  {
    "stats": {
      "totalCases": 150,
      "activeCases": 120,
      "myCases": 25,
      "missingPersons": 180,
      "activeReminders": 45,
      "overdueReminders": 5,
      "casesByStatus": [
        {
          "status": "Active",
          "count": 120
        },
        {
          "status": "Closed",
          "count": 30
        }
      ],
      "recentEvents": [
        {
          "eventId": "uuid",
          "lovedOneId": "LO123",
          "lovedOneName": "Jane Doe",
          "eventType": "Sighting",
          "timestamp": "2025-01-28T10:00:00.000Z",
          "description": "Witness reported seeing person at gas station"
        }
      ],
      "upcomingReminders": [
        {
          "reminderId": "uuid",
          "title": "Follow up with witness",
          "dueDate": "2025-02-01T10:00:00.000Z",
          "priority": "high"
        }
      ]
    }
  }
  ```
- **Permission Required**: `missing.read` (any authenticated user)
- **MCP Tool Needed**:
  - Tool ID: `missing.getDashboardStats`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {}
    }
    ```
  - Output Schema: Object with `stats` containing:
    - `totalCases`: Total number of cases
    - `activeCases`: Number of active cases
    - `myCases`: Number of cases assigned to logged-in user
    - `missingPersons`: Total number of missing persons
    - `activeReminders`: Number of incomplete reminders
    - `overdueReminders`: Number of overdue reminders
    - `casesByStatus`: Array of status counts
    - `recentEvents`: Array of recent timeline events (last 10)
    - `upcomingReminders`: Array of upcoming reminders (next 5 for current user)

**Note**: The dashboard stats are calculated in real-time and include personalized data (e.g., "myCases" and "upcomingReminders" are filtered for the logged-in user).

### Reports API

The Reports API provides comprehensive analytical reports for administrators. All report endpoints require admin role and support optional date range filtering.

#### Case Statistics Report

- **API Endpoint**: `GET /api/reports/case-statistics`
- **Description**: Generate a comprehensive case statistics report showing overview of all cases, status breakdown, trends, missing persons, reminders, and timeline events.
- **Parameters** (query):
  - `startDate` (string, optional): ISO date string - filter data from this date
  - `endDate` (string, optional): ISO date string - filter data until this date
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Case Statistics",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "statistics": {
        "cases": {
          "total": 150,
          "active": 120,
          "closed": 30,
          "followupRequired": 10,
          "onHold": 5,
          "byStatus": [
            { "status": "Active", "count": 120 },
            { "status": "Closed", "count": 30 }
          ]
        },
        "missingPersons": {
          "total": 180,
          "active": 150,
          "found": 30
        },
        "reminders": {
          "total": 200,
          "completed": 150,
          "overdue": 5
        },
        "timelineEvents": {
          "total": 500
        },
        "trends": {
          "casesByMonth": [
            { "month": "2025-01", "count": 15 }
          ]
        }
      }
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getCaseStatisticsReport`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {
        "startDate": {
          "type": "string",
          "description": "ISO date string - filter from this date"
        },
        "endDate": {
          "type": "string",
          "description": "ISO date string - filter until this date"
        }
      }
    }
    ```
  - Output Schema: Object with `report` containing case statistics data

#### Caseworker Activity Report

- **API Endpoint**: `GET /api/reports/caseworker-activity`
- **Description**: Generate a report showing activity metrics and performance for each caseworker including cases, reminders, timeline events, and witnesses.
- **Parameters** (query):
  - `startDate` (string, optional): ISO date string - filter data from this date
  - `endDate` (string, optional): ISO date string - filter data until this date
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Caseworker Activity",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "caseworkers": [
        {
          "caseworker": "Case Worker Name",
          "email": "worker@example.com",
          "cases": { "total": 25, "active": 20, "closed": 5 },
          "reminders": { "total": 50, "completed": 45, "overdue": 2, "completionRate": 90 },
          "timelineEvents": { "total": 100 },
          "witnesses": { "total": 15 }
        }
      ]
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getCaseworkerActivityReport`
  - Handler: `rest`
  - Input Schema: Same as Case Statistics Report
  - Output Schema: Object with `report` containing caseworker activity data

#### Case Detail Export

- **API Endpoint**: `GET /api/reports/case-detail-export`
- **Description**: Generate a detailed export of case information including events, reminders, witnesses, and timeline events for specific cases.
- **Parameters** (query):
  - `startDate` (string, optional): ISO date string - filter cases created from this date
  - `endDate` (string, optional): ISO date string - filter cases created until this date
  - `status` (string, optional): Filter by case status (e.g., "Active", "Closed")
  - `caseIds` (string, optional): Comma-separated list of case IDs (e.g., "A1,A2,A3")
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Case Detail Export",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "cases": [
        {
          "case": { "id": "A1", "name": "John Doe", "status": "Active" },
          "lovedOnes": [...],
          "reminders": [...],
          "timelineEvents": [...],
          "witnesses": [...]
        }
      ]
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getCaseDetailExport`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {
        "startDate": { "type": "string" },
        "endDate": { "type": "string" },
        "status": { "type": "string" },
        "caseIds": { "type": "string", "description": "Comma-separated case IDs" }
      }
    }
    ```
  - Output Schema: Object with `report` containing detailed case data

#### Community Report

- **API Endpoint**: `GET /api/reports/community`
- **Description**: Generate a comprehensive report for a First Nation community/reserve showing all related cases, missing persons, case notes, witnesses, reminders, and timeline events.
- **Parameters** (query):
  - `community` (string, required): Community/reserve name
  - `startDate` (string, optional): ISO date string - filter data from this date
  - `endDate` (string, optional): ISO date string - filter data until this date
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Community Report",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "community": "Peguis First Nation",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "summary": {
        "totalCases": 10,
        "activeCases": 8,
        "totalLovedOnes": 12,
        "activeLovedOnes": 10,
        "totalNotes": 50,
        "totalEvents": 30,
        "totalReminders": 20,
        "totalWitnesses": 15,
        "totalTimelineEvents": 40
      },
      "cases": [...],
      "lovedOnes": [...],
      "standaloneTimelineEvents": [...],
      "standaloneReminders": [...],
      "standaloneWitnesses": [...]
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getCommunityReport`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "required": ["community"],
      "properties": {
        "community": {
          "type": "string",
          "description": "Community/reserve name (required)"
        },
        "startDate": { "type": "string" },
        "endDate": { "type": "string" }
      }
    }
    ```
  - Output Schema: Object with `report` containing comprehensive community data

#### Workload Distribution Report

- **API Endpoint**: `GET /api/reports/workload-distribution`
- **Description**: Analyze workload balance across caseworkers to identify overloaded and underloaded staff. Calculates workload scores based on active cases, reminders, and missing persons.
- **Parameters**: None (no date filtering)
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Workload Distribution",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "summary": {
        "totalCaseworkers": 10,
        "averageWorkload": 45.5,
        "maxWorkload": 120,
        "minWorkload": 5,
        "overloaded": 2,
        "balanced": 6,
        "underloaded": 1,
        "noWorkload": 1
      },
      "caseworkers": [
        {
          "caseworker": "Case Worker Name",
          "email": "worker@example.com",
          "activeCases": 15,
          "activeReminders": 20,
          "overdueReminders": 2,
          "activeLovedOnes": 10,
          "workloadScore": 120,
          "status": "Overloaded",
          "deviation": "+50.0"
        }
      ]
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getWorkloadDistributionReport`
  - Handler: `rest`
  - Input Schema: 
    ```json
    {
      "type": "object",
      "properties": {}
    }
    ```
  - Output Schema: Object with `report` containing workload distribution analysis

#### Missing Person Demographics Report

- **API Endpoint**: `GET /api/reports/missing-person-demographics`
- **Description**: Generate demographic analysis of missing persons including age groups, gender distribution, time missing categories, status distribution, and risk factors.
- **Parameters** (query):
  - `startDate` (string, optional): ISO date string - filter cases created from this date
  - `endDate` (string, optional): ISO date string - filter cases created until this date
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Missing Person Demographics",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "totalMissingPersons": 180,
      "demographics": {
        "ageGroups": [
          { "group": "0-12", "count": 20 },
          { "group": "13-17", "count": 30 }
        ],
        "gender": [
          { "gender": "Male", "count": 90 },
          { "gender": "Female", "count": 90 }
        ],
        "timeMissing": [
          { "period": "0-24 hours", "count": 10 }
        ],
        "status": [
          { "status": "Active", "count": 150 }
        ]
      },
      "analysis": {
        "ageByStatus": {...},
        "genderByStatus": {...}
      },
      "riskFactors": {
        "highRiskStatus": 15,
        "longTermMissing": 20,
        "minors": 50,
        "recentMissing": 10
      }
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getMissingPersonDemographicsReport`
  - Handler: `rest`
  - Input Schema: Same as Case Statistics Report
  - Output Schema: Object with `report` containing demographic analysis

#### Witness Report

- **API Endpoint**: `GET /api/reports/witness`
- **Description**: Generate a comprehensive witness analysis report showing total witnesses, statement analysis, most active witnesses, witnesses by caseworker, and follow-up needs.
- **Parameters** (query):
  - `startDate` (string, optional): ISO date string - filter statements from this date
  - `endDate` (string, optional): ISO date string - filter statements until this date
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Witness Report",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "summary": {
        "totalWitnesses": 200,
        "statementAnalysis": {
          "withStatement": 150,
          "withoutStatement": 50,
          "complete": 120,
          "incomplete": 80
        },
        "avgStatementLength": 250,
        "totalCasesWithWitnesses": 50,
        "totalLovedOnesWithWitnesses": 60
      },
      "mostActiveWitnesses": [...],
      "witnessesByCaseworker": [...],
      "witnessesByPeriod": [...],
      "followUpNeeds": [...]
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getWitnessReport`
  - Handler: `rest`
  - Input Schema: Same as Case Statistics Report
  - Output Schema: Object with `report` containing witness analysis

#### Family Report

- **API Endpoint**: `GET /api/reports/family`
- **Description**: Generate a family/applicant analysis report showing repeat applicants, demographics, communication preferences, support needs, and families needing follow-up.
- **Parameters** (query):
  - `startDate` (string, optional): ISO date string - filter families created from this date
  - `endDate` (string, optional): ISO date string - filter families created until this date
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Family Report",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "summary": {
        "totalFamilies": 150,
        "repeatApplicantsCount": 10,
        "familiesWithMultipleMissingPersons": 5,
        "familiesWithSupport": 20
      },
      "demographics": {
        "province": [...],
        "community": [...],
        "status": [...],
        "language": [...]
      },
      "communicationAnalysis": {
        "smsOptIn": 100,
        "emailOptIn": 120,
        "canReceiveSms": 80,
        "canReceiveEmail": 100
      },
      "repeatApplicants": [...],
      "missingPersonsPerFamily": [...],
      "supportServices": [...],
      "followUpNeeds": [...]
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getFamilyReport`
  - Handler: `rest`
  - Input Schema: Same as Case Statistics Report
  - Output Schema: Object with `report` containing family analysis

#### Communications Report

- **API Endpoint**: `GET /api/reports/communications`
- **Description**: Generate a communications analysis report showing SMS and Email sent, recipients, opt-in status, frequency, and caseworker activity.
- **Parameters** (query):
  - `startDate` (string, optional): ISO date string - filter communications from this date
  - `endDate` (string, optional): ISO date string - filter communications until this date
- **Response Format**: 
  ```json
  {
    "report": {
      "type": "Communications Report",
      "generatedAt": "2025-01-28T12:00:00.000Z",
      "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
      "summary": {
        "totalCommunications": 500,
        "smsCount": 200,
        "emailCount": 300,
        "uniqueRecipients": 100,
        "uniqueCaseworkers": 10
      },
      "optInAnalysis": {
        "totalApplicants": 150,
        "smsOptIn": 100,
        "emailOptIn": 120,
        "canReceiveSms": 80,
        "canReceiveEmail": 100
      },
      "communicationsByPeriod": [...],
      "communicationsByCaseworker": [...],
      "mostContacted": [...],
      "recentCommunications": [...],
      "frequencyAnalysis": {...}
    }
  }
  ```
- **Permission Required**: `missing.admin` (admin role only)
- **MCP Tool Needed**:
  - Tool ID: `missing.getCommunicationsReport`
  - Handler: `rest`
  - Input Schema: Same as Case Statistics Report
  - Output Schema: Object with `report` containing communications analysis

**Note**: All Reports API endpoints require admin role (`missing.admin` permission scope). Reports support optional date range filtering via `startDate` and `endDate` query parameters (ISO date strings). Reports are generated in real-time and return comprehensive analytical data.

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

