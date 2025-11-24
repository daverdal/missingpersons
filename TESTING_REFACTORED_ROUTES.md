# Testing Refactored Case/Applicant Routes

## Step 1: Start the Server

First, make sure the server starts without errors:

```bash
npm start
```

**What to check:**
- Server should start on port 5000 (or your configured PORT)
- No errors about missing modules or route setup
- Look for any console errors related to routes

## Step 2: Test via GUI (Recommended First Test)

### A. View All Cases
1. Open the app in your browser: `http://localhost:5000`
2. Log in with your credentials
3. Navigate to "All Cases" or similar page
4. **Expected:** Should see the list of cases/applicants

### B. Add New Applicant (Intake Form)
1. Navigate to the intake form
2. Fill out the form with test data:
   - Applicant name
   - Contact information
   - Optional: Loved One details
3. Submit the form
4. **Expected:** 
   - Form submits successfully
   - New applicant appears in the cases list
   - No errors in browser console or server logs

### C. View Case Details
1. Click on a case/applicant from the list
2. **Expected:** 
   - Case details page loads
   - Shows applicant info, loved ones, notes, etc.

### D. Search for Applicants
1. Use the search functionality (if available in GUI)
2. Search by name
3. **Expected:** 
   - Search results appear
   - No errors

### E. View "My Cases"
1. Navigate to "My Cases" (if you have assigned cases)
2. **Expected:** 
   - Shows cases assigned to you
   - No errors

## Step 3: Test via API (Direct Testing)

You can test the endpoints directly using curl, Postman, or your browser's developer tools.

### Get Your JWT Token First

1. Log in via the GUI
2. Open browser DevTools (F12) → Application/Storage → Cookies
3. Find the JWT token cookie (usually named `token` or `jwt`)
4. Copy the token value

### Test Endpoints

#### 1. Get All Cases
```bash
curl -X GET "http://localhost:5000/api/cases" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 2. Get All Cases (with expand)
```bash
curl -X GET "http://localhost:5000/api/cases?expand=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 3. Search Applicants
```bash
curl -X GET "http://localhost:5000/api/applicants/search?name=John" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 4. Get Applicant by ID
```bash
curl -X GET "http://localhost:5000/api/applicants/A1234567890" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 5. Get Complete Applicant Details
```bash
curl -X GET "http://localhost:5000/api/applicants/A1234567890/complete" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 6. Get My Cases
```bash
curl -X GET "http://localhost:5000/api/my-cases" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 7. Create New Intake (POST)
```bash
curl -X POST "http://localhost:5000/api/intake" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "applicantName": "Test Applicant",
    "contact": "555-1234",
    "email": "test@example.com",
    "kinshipRole": "Mother",
    "status": "Active"
  }'
```

#### 8. Update Applicant
```bash
curl -X PUT "http://localhost:5000/api/applicants/A1234567890" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "contact": "555-5678"
  }'
```

## Step 4: Check Server Logs

While testing, watch the server console for:
- ✅ Route hits (if you have logging enabled)
- ❌ Any errors or stack traces
- ❌ "Cannot GET /api/..." errors (means route not found)

## Step 5: Verify Routes Are Loaded

Check that the routes are properly registered by looking for:
- No "Route not found" errors
- Successful responses (200, 201 status codes)
- Proper error handling (400, 403, 404, 500) when appropriate

## Common Issues to Watch For

1. **"Cannot GET /api/cases"** → Routes not properly registered
2. **"driver is not defined"** → Controller not receiving dependencies
3. **"auditLogger is not defined"** → Dependencies not passed correctly
4. **500 Internal Server Error** → Check server logs for details

## Quick Test Checklist

- [ ] Server starts without errors
- [ ] Can view all cases via GUI
- [ ] Can add new applicant via intake form
- [ ] Can view case details
- [ ] Can search for applicants
- [ ] Can view "My Cases"
- [ ] API endpoints return expected data
- [ ] No errors in server console
- [ ] No errors in browser console

## If Something Breaks

1. Check server console for error messages
2. Check browser console (F12) for client-side errors
3. Verify the route is registered in `server.js`:
   ```javascript
   const caseRouter = express.Router();
   setupCaseRoutes(caseRouter, { driver, auditLogger, authMiddleware, requireRole });
   app.use('/api', caseRouter);
   ```
4. Verify the controller file exists: `controllers/caseController.js`
5. Verify the routes file exists: `routes/cases.js`

