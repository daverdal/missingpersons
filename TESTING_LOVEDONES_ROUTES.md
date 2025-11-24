# Testing LovedOnes Routes

This guide helps you test the refactored LovedOnes routes.

## Prerequisites

1. **Start the server**: `npm start` (restart if already running)
2. **Login as admin or case_worker** (all routes require one of these roles)
3. **Have test data**: At least one LovedOne with related Applicant in the database

## Testing Methods

### Method 1: GUI Testing (Recommended)

#### 1. Test GET /api/loved-ones (by community)

**Navigate to**: `http://localhost:3000/search-community.html`

**Steps**:
- Select a community from the dropdown
- Click "Search"
- Verify loved ones for that community are displayed

**Also test**: `http://localhost:3000/search-map.html`
- Click on a community marker on the map
- Verify the popup shows loved ones for that community

**Test with expand parameter**:
- In browser console, run:
  ```javascript
  fetch('/api/loved-ones?community=YOUR_COMMUNITY&expand=true', {
    headers: {'Authorization': 'Bearer ' + localStorage.getItem('token')}
  })
  .then(r => r.json())
  .then(console.log);
  ```
- Verify response includes `referringOrg`, `community`, and `assignedTo` fields

#### 2. Test GET /api/loved-ones/with-coordinates

**Navigate to**: `http://localhost:3000/search-map.html`

**Steps**:
- The map should automatically load loved ones with coordinates
- Check the "Toggle Loved Ones" checkbox
- Verify markers appear on the map for loved ones with `lastLocationLat` and `lastLocationLon`
- Click on a marker to see the popup with loved one details

**Expected**: Markers appear on the map for loved ones that have coordinates

#### 3. Test GET /api/loved-ones/by-date

**Navigate to**: `http://localhost:3000/search-community.html`

**Steps**:
- Select date range (From and To dates)
- Click "Search by Date Range"
- Verify loved ones within the date range are displayed

**Test in console**:
```javascript
fetch('/api/loved-ones/by-date?start=2024-01-01&end=2024-12-31', {
  headers: {'Authorization': 'Bearer ' + localStorage.getItem('token')}
})
.then(r => r.json())
.then(console.log);
```

#### 4. Test GET /api/loved-ones/by-province

**Test in browser console**:
```javascript
// Test with province code
fetch('/api/loved-ones/by-province?province=AB', {
  headers: {'Authorization': 'Bearer ' + localStorage.getItem('token')}
})
.then(r => r.json())
.then(console.log);

// Test with full province name
fetch('/api/loved-ones/by-province?province=Alberta', {
  headers: {'Authorization': 'Bearer ' + localStorage.getItem('token')}
})
.then(r => r.json())
.then(console.log);
```

**Expected**: Returns loved ones in the specified province

#### 5. Test PUT /api/loved-ones/:id (Update)

**Navigate to**: `http://localhost:3000/casenotes.html?caseId=YOUR_CASE_ID`

**Steps**:
- Find a loved one in the case
- Click "Edit" button on a loved one
- Modify some fields (e.g., name, status, location)
- Click "Save"
- Verify the changes are saved and displayed

**Test in console** (replace `LOVED_ONE_ID` with actual ID):
```javascript
fetch('/api/loved-ones/LOVED_ONE_ID', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  },
  body: JSON.stringify({
    name: 'Updated Name',
    status: 'Active',
    applicantId: 'YOUR_APPLICANT_ID'
  })
})
.then(r => r.json())
.then(console.log);
```

### Method 2: API Testing (Browser Console)

Open browser console (F12) and test each endpoint:

```javascript
// Get token
const token = localStorage.getItem('token') || document.cookie.match(/(^| )token=([^;]+)/)?.[2];

// 1. Get loved ones by community
fetch('/api/loved-ones?community=YOUR_COMMUNITY', {
  headers: {'Authorization': 'Bearer ' + token}
})
.then(r => r.json())
.then(console.log);

// 2. Get loved ones with coordinates
fetch('/api/loved-ones/with-coordinates', {
  headers: {'Authorization': 'Bearer ' + token}
})
.then(r => r.json())
.then(console.log);

// 3. Get loved ones by date range
fetch('/api/loved-ones/by-date?start=2024-01-01&end=2024-12-31', {
  headers: {'Authorization': 'Bearer ' + token}
})
.then(r => r.json())
.then(console.log);

// 4. Get loved ones by province
fetch('/api/loved-ones/by-province?province=AB', {
  headers: {'Authorization': 'Bearer ' + token}
})
.then(r => r.json())
.then(console.log);

// 5. Update loved one (replace LOVED_ONE_ID and APPLICANT_ID)
fetch('/api/loved-ones/LOVED_ONE_ID', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    name: 'Test Update',
    applicantId: 'APPLICANT_ID'
  })
})
.then(r => r.json())
.then(console.log);
```

## Expected Behaviors

### GET /api/loved-ones
- ✅ Requires `community` query parameter
- ✅ Returns loved ones for that community
- ✅ Supports `?expand=true` for comprehensive data
- ✅ Requires admin or case_worker role

### GET /api/loved-ones/with-coordinates
- ✅ Returns only loved ones with `lastLocationLat` and `lastLocationLon`
- ✅ Includes applicant and relationship data
- ✅ Requires admin or case_worker role

### GET /api/loved-ones/by-date
- ✅ Requires `start` and `end` query parameters (YYYY-MM-DD format)
- ✅ Returns loved ones with `dateOfIncident` in the range
- ✅ Requires admin or case_worker role

### GET /api/loved-ones/by-province
- ✅ Requires `province` query parameter
- ✅ Accepts province code (e.g., 'AB') or full name (e.g., 'Alberta')
- ✅ Returns loved ones in that province
- ✅ Requires admin or case_worker role

### PUT /api/loved-ones/:id
- ✅ Updates loved one properties
- ✅ Admin can update any loved one
- ✅ Case_worker can only update if assigned to the related applicant
- ✅ Returns updated loved one data
- ✅ Logs audit trail

## Common Issues

### "Forbidden: insufficient role"
- Make sure you're logged in as admin or case_worker
- Check your JWT token has the correct roles

### "community is required"
- Make sure you provide the `community` query parameter
- Community name must match exactly (case-sensitive)

### "start and end are required"
- Date format must be YYYY-MM-DD
- Both start and end dates are required

### "province is required"
- Provide province code (AB, BC, ON, etc.) or full name (Alberta, British Columbia, etc.)

### "Not authorized" (on PUT)
- Case_worker must be assigned to the applicant case
- Or use admin account

## Verification Checklist

After testing, verify:
- [ ] Search by community works in search-community.html
- [ ] Map displays loved ones with coordinates
- [ ] Search by date range works
- [ ] Search by province works (test both code and name)
- [ ] Update loved one works from case notes page
- [ ] Expand parameter includes additional data
- [ ] All endpoints require proper authentication
- [ ] Role-based access control works (admin/case_worker)
- [ ] No console errors in browser or server logs

