# Testing Utility Routes Refactoring

This guide helps you test the three utility routes that were just refactored:
- `/api/create-admin` (POST)
- `/api/upload` (POST)
- `/api/admin` (GET)

## Prerequisites

1. Make sure your server is running: `npm start`
2. Have a valid JWT token from logging in (you can get this from the browser's developer tools after logging in)

## Test 1: Admin Check Endpoint (`GET /api/admin`)

**Purpose:** Verify that the admin check endpoint works correctly.

**Steps:**
1. Open your browser's developer tools (F12)
2. Go to the Console tab
3. Get your JWT token (check localStorage or cookies, or copy from a previous API call)
4. Run this in the console:

```javascript
// Replace YOUR_JWT_TOKEN with your actual token
fetch('/api/admin', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
})
.then(res => res.json())
.then(data => console.log('Admin check result:', data))
.catch(err => console.error('Error:', err));
```

**Expected Result:**
- If you're logged in as an admin: `{ message: "You are an admin!", user: {...} }`
- If you're not an admin: `{ error: "Forbidden: insufficient role" }` (403 status)

---

## Test 2: File Upload Endpoint (`POST /api/upload`)

**Purpose:** Verify that the general file upload endpoint works correctly.

**Steps:**
1. Create a simple test file (e.g., `test.txt` with some content)
2. Open your browser's developer tools (F12)
3. Go to the Console tab
4. Get your JWT token
5. Run this in the console:

```javascript
// Create a FormData object with a test file
const formData = new FormData();
const blob = new Blob(['Test file content'], { type: 'text/plain' });
formData.append('file', blob, 'test.txt');

// Replace YOUR_JWT_TOKEN with your actual token
fetch('/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: formData
})
.then(res => res.json())
.then(data => {
  console.log('Upload result:', data);
  if (data.filename) {
    console.log('File uploaded successfully! Filename:', data.filename);
  }
})
.catch(err => console.error('Error:', err));
```

**Expected Result:**
- If authenticated as admin or case_worker: `{ filename: "...", originalname: "test.txt", path: "..." }`
- If not authenticated: `{ error: "Unauthorized" }` (401 status)
- If authenticated but not admin/case_worker: `{ error: "Forbidden: insufficient role" }` (403 status)

**Alternative: Using a File Input**
If you prefer, you can also test via the UI if there's a file upload feature in the app, or use a tool like Postman.

---

## Test 3: Create Admin Endpoint (`POST /api/create-admin`)

**Purpose:** Verify that the create admin endpoint works (typically only used during initial setup).

**Note:** This endpoint doesn't require authentication, so use with caution. It's typically only used to create the first admin user.

**Steps:**
1. Open your browser's developer tools (F12)
2. Go to the Console tab
3. Run this in the console:

```javascript
fetch('/api/create-admin', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Test Admin',
    email: 'testadmin@example.com',
    password: 'TestPassword123!'
  })
})
.then(res => res.json())
.then(data => {
  console.log('Create admin result:', data);
  if (data.success) {
    console.log('Admin created successfully!');
  }
})
.catch(err => console.error('Error:', err));
```

**Expected Result:**
- If the email doesn't exist: `{ success: true, user: { name: "...", email: "...", roles: ["admin"] } }`
- If the email already exists: `{ error: "User already exists" }` (409 status)
- If missing fields: `{ error: "Missing required fields" }` (400 status)

**Note:** After creating a test admin, you may want to delete it or use a unique email for testing.

---

## Quick Test Summary

1. **Admin Check** - Verify admin authentication works
2. **File Upload** - Verify file uploads work for admin/case_worker roles
3. **Create Admin** - Verify admin creation works (optional, typically only for initial setup)

All three endpoints should work exactly as they did before the refactoring, but now they're organized in the `controllers/utilityController.js` and `routes/utility.js` modules.

