const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Main landing page route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server on port 3000 (customize as needed)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Landing page server running on http://localhost:${PORT}`);
});
