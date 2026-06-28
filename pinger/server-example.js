// server.js - Your main Express app

import express from 'express';
import { initKeepAlive } from './keepalive.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ========== YOUR EXISTING ROUTES ==========
app.use(express.json());

// Your API routes
app.get('/api/data', (req, res) => {
  res.json({ message: 'Your API endpoint' });
});

// Your other endpoints...

// ========== ADD THIS HEALTH ENDPOINT ==========
// This is what the keep-alive will ping
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ========== START SERVER ==========
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // Initialize keep-alive AFTER server starts
  initKeepAlive();
});

// ========== GRACEFUL SHUTDOWN ==========
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
