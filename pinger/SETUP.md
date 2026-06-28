# Keep-Alive for Your Render Backend (Self-Hosted Solution)

**The simplest approach:** Keep your backend awake without external services!

---

## How It Works

Your Render backend **pings itself** every 14 minutes (before the 15-minute spin-down timer).

```
Server starts
    ↓
Initializes keep-alive
    ↓
Every 14 minutes, server pings its own /health endpoint
    ↓
Render sees activity → doesn't spin down
    ↓
No cold starts!
```

---

## 🚀 Implementation (3 Easy Steps)

### Step 1: Copy the `keepalive.js` file into your Render project

```
your-project/
├── server.js (your main file)
├── keepalive.js ← ADD THIS FILE
├── package.json
└── ...
```

### Step 2: Import and initialize in your `server.js`

**Before:**
```javascript
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**After:**
```javascript
import express from 'express';
import { initKeepAlive } from './keepalive.js'; // ← ADD THIS

const app = express();
const PORT = process.env.PORT || 3000;

// Add a health endpoint (if you don't have one)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initKeepAlive(); // ← ADD THIS LINE
});
```

### Step 3: Deploy to Render

Just push to GitHub. No environment variables needed!

---

## ✅ What Gets Added

**File Size:** ~2KB (negligible)

**Memory Usage:** ~1-2MB (basically nothing)

**Request Frequency:** 1 request every 14 minutes

**CPU Usage:** Minimal (just an HTTP ping)

---

## 🔍 Verify It's Working

After deploying, check your **Render logs**:

```
✅ Keep-Alive initialized. Will ping https://my-api.onrender.com/health every 14 minutes
[KeepAlive] ✅ Pinged successfully at 2026-06-28T10:30:00.000Z
[KeepAlive] ✅ Pinged successfully at 2026-06-28T10:44:00.000Z
```

---

## ⚙️ Customization

### Change ping interval

In `keepalive.js`, adjust `PING_INTERVAL`:

```javascript
// Ping every 10 minutes
const PING_INTERVAL = 10 * 60 * 1000;

// Ping every 5 minutes (most aggressive)
const PING_INTERVAL = 5 * 60 * 1000;

// Ping every 20 minutes (still safe, minimal requests)
const PING_INTERVAL = 20 * 60 * 1000;
```

**Recommendation:** 14 minutes is optimal (stays under the 15-min spin-down threshold with margin)

### Change the health endpoint

If your endpoint is different:

```javascript
// In keepalive.js, change the fetch URL
const response = await fetch(`${SELF_URL}/api/status`, { // ← different endpoint
```

Or add a simple health endpoint to your app:

```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

---

## 🎯 For Your B.Sc. Research Project

If you're hosting your **e-commerce ML pipeline** on Render, this keeps it warm so:

✅ Users don't experience cold starts when checking delivery predictions
✅ Your ML model stays loaded in memory
✅ API responses are instant
✅ No extra infrastructure needed

---

## 💰 Cost Comparison

### With external Vercel pinger:
- Vercel function deployment
- GitHub Actions setup
- External monitoring dashboard
- **Complexity:** Medium

### With self-hosted keep-alive (this solution):
- 2KB of code added to your existing project
- Pings itself
- No external dependencies
- **Complexity:** Minimal ✅

---

## ⚠️ Important Notes

1. **Node.js 18+:** Uses native `fetch`. If you're on older Node, use:
   ```bash
   npm install node-fetch
   ```

2. **Render External URL:** The code uses `process.env.RENDER_EXTERNAL_URL` automatically. No config needed!

3. **Graceful shutdown:** The code includes proper signal handling for clean shutdowns.

4. **Logs:** Check Render dashboard logs to verify pings are happening.

---

## 🚨 Troubleshooting

**"Keep-Alive initialized" message not appearing**
- Check that `initKeepAlive()` is being called in your server startup
- Verify it's called AFTER `server.listen()`

**Logs show "Ping failed"**
- Make sure your `/health` endpoint returns 200 OK
- Check that `RENDER_EXTERNAL_URL` is set (Render does this automatically)

**Server keeps spinning down**
- Interval might be too long. Try 10 minutes instead of 14.
- Verify the health endpoint is actually responding

---

## 📊 Monitoring (Optional)

If you want to track pings over time, add this to your `/health` endpoint:

```javascript
let lastPingTime = null;

app.get('/health', (req, res) => {
  // Check if this is a keep-alive ping
  const isKeepAlivePing = req.headers['user-agent']?.includes('KeepAlive-Monitor');
  
  if (isKeepAlivePing) {
    lastPingTime = new Date();
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    lastKeepAlivePing: lastPingTime,
    uptime: process.uptime()
  });
});
```

---

## Summary

✅ Simplest solution
✅ No external services
✅ 2KB of code
✅ Works immediately
✅ Perfect for Render free tier

Just add the code and push to Render. Done!
