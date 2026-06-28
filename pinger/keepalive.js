// keepalive.js - Add this to your Render backend

import fetch from 'node-fetch'; // or use native fetch in Node 18+

const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes (Render spins down after 15 min of inactivity)

let isScheduled = false;

/**
 * Initialize keep-alive pinging
 * Call this once when your server starts
 */
export function initKeepAlive() {
  if (isScheduled) return;
  
  isScheduled = true;
  console.log(`✅ Keep-Alive initialized. Will ping ${SELF_URL}/health every 14 minutes`);
  
  // First ping after 30 seconds (ensure server is ready)
  setTimeout(pingServer, 30000);
  
  // Then ping every 14 minutes
  setInterval(pingServer, PING_INTERVAL);
}

/**
 * Ping the server's health endpoint
 */
async function pingServer() {
  try {
    const response = await fetch(`${SELF_URL}/health`, {
      timeout: 5000,
      headers: { 'User-Agent': 'KeepAlive-Monitor/1.0' }
    });
    
    if (response.ok) {
      console.log(`[KeepAlive] ✅ Pinged successfully at ${new Date().toISOString()}`);
    } else {
      console.warn(`[KeepAlive] ⚠️ Ping returned status ${response.status}`);
    }
  } catch (error) {
    console.error(`[KeepAlive] ❌ Ping failed:`, error.message);
  }
}

export default { initKeepAlive };
