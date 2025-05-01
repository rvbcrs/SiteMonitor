const express = require('express');
const cors = require('cors');
const path = require('path');
const router = require('./api');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/build')));

// API routes
app.use('/api', router);

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// Start server
app.listen(port, () => {
    console.log(`API service running on port ${port}`);
}); 