# Timeline Feature Blueprint

## Blueprint 1: Complete Event System Blueprint (Tech-Agnostic, for LovedOne App)

(Copy this whole section into Cursor AI)

### 1. Core Concept

Each LovedOne (a missing person case) has a history made up of Events.

Every important update, sighting, status change, or action creates an Event.

This system powers:

- A single global timeline for all cases
- A timeline per LovedOne
- An audit/history trail
- Analytics
- Real-time operational awareness (who went missing when)

### 2. Entities

**LovedOne (Existing Entity)**

Represents a missing person case. Minimum required fields:

- lovedOneId (unique)
- name
- age
- status (current status)
- primaryPhotoUrl (optional)
- createdAt
- updatedAt

**Relationship:**
LovedOne (1) → (∞) Events

### 3. Event Entity (New)

Represents a single timeline entry.

**Attributes**

| Field | Type | Description |
|-------|------|-------------|
| eventId | Unique Identifier | Unique per event |
| lovedOneId | Identifier | Which LovedOne this event belongs to |
| eventType | Enum | Category/type of event |
| timestamp | DateTime | When the event occurred (use UTC) |
| createdBy | Identifier | User, system, or caller who created it |
| description | Text | Human-readable details |
| location | Optional | Text or geo-coordinates |
| metadata | Optional Key/Value Map | Flexible extra data |

**Notes**

- Keep this schema stable; extend with metadata.
- Time-based sorting is always possible.
- Works with any backend or database.

### 4. EventType Enumeration

Recommended event types:

**EventType:**
- CaseOpened
- MissingReported
- LastSeen
- Sighting
- StatusChanged
- SearchDispatched
- TipReceived
- NoteAdded
- Found
- CaseClosed

You can expand this later without breaking anything.

### 5. When to Create an Event

Events are generated automatically whenever something meaningful happens:

- **CaseOpened** - When the LovedOne record is created.
- **MissingReported** - First report that the person is missing.
- **LastSeen** - When known last-seen information is added or updated.
- **Sighting** - Any citizen call, police report, or confirmation.
- **TipReceived** - Unverified information, rumors, family notes, etc.
- **StatusChanged** - Any official status change (Active → High Risk).
- **SearchDispatched** - Fire/Police/SAR deployed.
- **Found** - Person located (safe or not). This usually triggers notifications.
- **CaseClosed** - Administrative closing.
- **NoteAdded** - Miscellaneous caseworker notes.

Each event forms a chronological part of the case history.

### 6. Timeline Construction (Frontend-Agnostic)

**Individual LovedOne Timeline**

- Filter Events by lovedOneId
- Sort ascending by timestamp

**Global Timeline (All LovedOnes)**

- Fetch all Events
- Sort by timestamp
- Group by LovedOne (optional)
- Filter by eventType, date range, or community (optional)

This creates a full "situational dashboard" for caseworkers.

### 7. Recommended Timeline Visualization (Police-Style)

For a professional investigative timeline, the recommended choice is:

⭐ **vis-timeline (from the vis.js suite)**

**Why:**

- Used in real investigative & intelligence visualization systems
- Supports groups (one row per LovedOne)
- Zoom (days, weeks, months)
- Drag/scroll
- Click event details
- Cluster dense event sets
- Horizontal timeline like law enforcement tools

**Perfect for:**

- Multi-case, multi-event police timelines
- Large datasets
- Fast UI performance

This library is frontend-agnostic; Cursor can generate Node/React/Vue/Next/Angular bindings as needed.

### 8. Metadata Field (Future-Proofing)

metadata is a flexible map/dictionary that can store:

- Phone number of reporter
- Vehicle description
- Weather conditions
- Risk level
- Photo URLs
- Search team identifiers
- GIS coordinates
- Anything needed later

This prevents schema changes when new requirements appear.

### 9. Validation Rules (Universal)

- Every Event must reference one valid lovedOneId.
- eventType must come from the enum.
- timestamp should be UTC.
- description should be required for most event types.
- Found should auto-set the LovedOne's status to "Found" (configurable).

### 10. Example Combined Timeline (Global)

```
2025-01-02   John Fisher – MissingReported
2025-01-03   Maria Yazzie – MissingReported
2025-01-04   John Fisher – Sighting
2025-01-06   Maria Yazzie – TipReceived
2025-01-07   John Fisher – Found
2025-01-09   Maria Yazzie – StatusChanged ("Active → High")
```

This is what your caseworkers will scroll through.

### 11. Example Minimum Viable Event Flow

For a typical LovedOne case:

1. CaseOpened
2. MissingReported
3. LastSeen
4. Sighting
5. TipReceived
6. StatusChanged
7. SearchDispatched
8. Found
9. CaseClosed

This gives a complete narrative from start to end.

✔ END OF BLUEPRINT 1

---

## Blueprint 2: Timeline UI Blueprint (Short Version)

### 1. Layout Options

**A. Horizontal Timeline (Recommended)**

- Scroll left/right
- Each LovedOne is a row (group)
- Events appear as clickable dots
- Click → show details panel below
- Zoom in/out (hours → days → months)

**B. Vertical Feed Timeline (Facebook-style)**

- Sorted newest → oldest
- Each event is a card
- Shows: person name, event type, timestamp, description
- Infinite scroll

Use horizontal for investigations, vertical for daily activity feed.

### 2. Event Display Rules

Each event dot/card shows:

- Color by eventType
- Icon by eventType
- Hover = small tooltip
- Click = opens detail panel

Colors & icons keep the UI readable at a glance.

### 3. Detail Panel (Expandable Drawer)

When clicking an event:

- Title: `<EventType> – <Name>`
- Timestamp
- Description
- Optional image / map / metadata
- Buttons: "Edit Event", "Open LovedOne"

This should appear as a collapsible section under the timeline.

### 4. Filtering / Controls

Controls bar should include:

- Date range
- Event types (checkboxes)
- Communities (optional)
- LovedOne selection
- "Show Only Active Cases" toggle

Simple, minimal interface.

### 5. Recommended Visualization Library

**vis-timeline**

- Police-style
- Supports groups (one row per LovedOne)
- Fast with large datasets
- Good interaction model (zoom/drag)

You can use any frontend, Cursor will wire it up.

✔ END OF BLUEPRINT 2

