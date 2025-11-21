# AMC Landing Page

Landing page for Assembly of Manitoba Chiefs applications, accessible at `http://192.168.2.27` (port 80).

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

## Access

Once running, the landing page will be accessible at:
- **Local**: `http://localhost`
- **Network**: `http://192.168.2.27`

## Adding New Apps

To add a new application link, edit `public/index.html` and add a new link in the `.links` div:

```html
<a href="http://192.168.2.27:PORT" class="app-link">
  <span class="app-name">App Name</span>
  <span class="app-desc">App description</span>
</a>
```

## Notes

- Port 80 requires administrator privileges on Windows
- The server listens on all network interfaces (`0.0.0.0`) to allow network access
- Make sure Windows Firewall allows incoming connections on port 80

