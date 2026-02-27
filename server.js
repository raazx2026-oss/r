const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// ================== Data Structures ==================
// In-memory storage (for demo; use Redis/DB in production)
let commandQueue = {};        // { deviceId: [commands] }
let deviceStatus = {};        // { deviceId: { lastSeen: timestamp, online: boolean } }
let commandResults = {};      // { deviceId: [ {command, result, timestamp} ] } (optional)

// ================== Helper Functions ==================
function updateDeviceSeen(deviceId) {
    deviceStatus[deviceId] = {
        lastSeen: Date.now(),
        online: true
    };
}

// Clean up offline devices (optional)
setInterval(() => {
    const now = Date.now();
    for (let deviceId in deviceStatus) {
        if (now - deviceStatus[deviceId].lastSeen > 60000) { // 1 minute offline
            deviceStatus[deviceId].online = false;
        }
    }
}, 30000);

// ================== API Endpoints ==================

/**
 * @route POST /api/command
 * @desc  Android app sends command to a specific device
 *        Body: { "deviceId": "phone1", "command": "wifi on" }
 */
app.post('/api/command', (req, res) => {
    const { deviceId, command } = req.body;
    if (!deviceId || !command) {
        return res.status(400).json({ error: 'deviceId and command required' });
    }

    if (!commandQueue[deviceId]) {
        commandQueue[deviceId] = [];
    }
    commandQueue[deviceId].push(command);
    console.log(`[SERVER] Command queued for ${deviceId}: ${command}`);

    // Immediately try to notify any waiting poll (long polling already handled)
    res.json({ status: 'queued', deviceId, command });
});

/**
 * @route GET /api/poll/:deviceId
 * @desc  Termux client long polls for commands. Waits up to 30 seconds.
 */
app.get('/api/poll/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    const timeout = 30000; // 30 seconds

    // Update device seen timestamp
    updateDeviceSeen(deviceId);

    if (!commandQueue[deviceId]) {
        commandQueue[deviceId] = [];
    }

    // If command already waiting, return immediately
    if (commandQueue[deviceId].length > 0) {
        const command = commandQueue[deviceId].shift();
        console.log(`[SERVER] Immediate command for ${deviceId}: ${command}`);
        return res.json({ command });
    }

    // Otherwise, wait for a command to arrive
    let responded = false;
    const timer = setTimeout(() => {
        if (!responded) {
            responded = true;
            res.json({ command: null }); // no command, just keep polling
        }
    }, timeout);

    // Polling mechanism: check every second for new commands
    const interval = setInterval(() => {
        if (responded) return;
        if (commandQueue[deviceId].length > 0) {
            clearInterval(interval);
            clearTimeout(timer);
            responded = true;
            const command = commandQueue[deviceId].shift();
            console.log(`[SERVER] Delayed command for ${deviceId}: ${command}`);
            res.json({ command });
        }
    }, 1000);

    // Cleanup on client disconnect
    req.on('close', () => {
        clearInterval(interval);
        clearTimeout(timer);
    });
});

/**
 * @route POST /api/result
 * @desc  Termux client reports command execution result
 *        Body: { "deviceId": "phone1", "command": "wifi on", "result": "success", "error": null }
 */
app.post('/api/result', (req, res) => {
    const { deviceId, command, result, error } = req.body;
    console.log(`[SERVER] Result from ${deviceId} for command "${command}":`, result || error);

    // Store result for history (optional)
    if (!commandResults[deviceId]) commandResults[deviceId] = [];
    commandResults[deviceId].push({
        command,
        result: result || error,
        timestamp: Date.now()
    });

    res.sendStatus(200);
});

/**
 * @route POST /api/register
 * @desc  Termux client sends heartbeat to register/update its presence
 *        Body: { "deviceId": "phone1", "info": { "model": "xyz", "battery": 80 } }
 */
app.post('/api/register', (req, res) => {
    const { deviceId, info } = req.body;
    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
    }
    updateDeviceSeen(deviceId);
    // Optionally store additional device info
    if (!deviceStatus[deviceId]) deviceStatus[deviceId] = {};
    deviceStatus[deviceId].info = info || {};
    console.log(`[SERVER] Device registered: ${deviceId}`);
    res.json({ status: 'registered', deviceId });
});

/**
 * @route GET /api/devices
 * @desc  Android app fetches list of online devices
 */
app.get('/api/devices', (req, res) => {
    const onlineDevices = [];
    for (let deviceId in deviceStatus) {
        if (deviceStatus[deviceId].online) {
            onlineDevices.push({
                deviceId,
                lastSeen: deviceStatus[deviceId].lastSeen,
                info: deviceStatus[deviceId].info || {}
            });
        }
    }
    res.json(onlineDevices);
});

/**
 * @route GET /api/status/:deviceId
 * @desc  Get status of a specific device
 */
app.get('/api/status/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    const status = deviceStatus[deviceId] || { online: false, lastSeen: null };
    res.json({ deviceId, ...status });
});

// Optional: Command history for a device
app.get('/api/history/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    const history = commandResults[deviceId] || [];
    res.json(history);
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('WiFi Control Server is running. Use /api endpoints.');
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});