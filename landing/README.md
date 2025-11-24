# AMC Missing Loved Ones Site

Public-facing microsite for the Assembly of Manitoba Chiefs Missing Persons program. It provides:

- A live list of missing loved ones pulled from the main API (`/api/public/loved-ones`)
- A secure intake form for potential applicants (`/api/public/contact`)
- Program information and emergency resources

The static site is served from the `landing` folder (port 80 by default) and fetches data from the primary Node/Express API.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

## Running the Server

### Option 1: Using the Batch File (Recommended)
- Right-click `start-landing.bat` and select **"Run as Administrator"**
- This is required because port 80 requires administrator privileges on Windows

### Option 2: Using npm
- Open PowerShell or Command Prompt **as Administrator**
- Navigate to the `landing` folder
- Run: `npm start`

### Option 3: Using Node directly
- Open PowerShell or Command Prompt **as Administrator**
- Navigate to the `landing` folder
- Run: `node server.js`

## API configuration

Update `public/config.js` to point at the environment hosting the API. By default the script assumes the API is on the same host using port `5000`.

Examples:

```js
// Same machine / dev
window.PUBLIC_API_BASE = 'http://localhost:5000';

// Production domain
window.PUBLIC_API_BASE = 'https://missing.amc.ca';
```

## Customizing content

- Text content lives in `public/index.html`
- Colors/layout are defined in `public/style.css`
- Front-end behavior (fetching loved ones and submitting the form) is in `public/main.js`
- Update emergency contacts or helpline numbers inside the `contact__info` block in `index.html`

## Access

Once running, the site will be accessible at:
- **Local**: `http://localhost`
- **Network**: `http://192.168.2.27`

## Notes

- Port 80 requires administrator privileges on Windows
- The server listens on all network interfaces (`0.0.0.0`) to allow network access
- Make sure Windows Firewall allows incoming connections on port 80

