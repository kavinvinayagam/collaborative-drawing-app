const express = require('express');
const WebSocket = require('ws');
const http = require('http');

// --- Helper Functions ---

function generateUserId() {
    return Math.random().toString(36).substr(2, 9);
}

function assignUserColor() {
    const colors = ['#e57373', '#64b5f6', '#81c784', '#ffd54f', '#ba68c8', '#4db6ac'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// --- Server State ---

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const users = new Map();
let operationHistory = []; // The full, chronological list of all drawing operations
let historyIndex = -1;     // Pointer to the last *active* operation (index 0 up to this index is drawn)

// --- Communication Functions ---

function broadcast(data, excludeUserId = null) {
    users.forEach((user, id) => {
        if (id !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(JSON.stringify(data));
        }
    });
}

function broadcastHistoryState() {
    // Slice the array from the beginning up to the active index (inclusive)
    const currentOperations = operationHistory.slice(0, historyIndex + 1);
    broadcast({ 
        type: 'historyUpdate', 
        operations: currentOperations 
    });
}

// --- WebSocket Connection Handling ---

wss.on('connection', (ws) => {
    const userId = generateUserId();
    const userColor = assignUserColor();
    const userName = `User${userId.substr(0, 4)}`;

    users.set(userId, { id: userId, ws: ws, name: userName, color: userColor });

    // 1. Send the new user their ID and color
    ws.send(JSON.stringify({ type: 'init', userId, color: userColor }));

    // 2. Send the full list of current users to the new user
    const usersList = Array.from(users.values()).map(u => ({
        id: u.id,
        name: u.name,
        color: u.color
    }));
    ws.send(JSON.stringify({ type: 'usersList', users: usersList }));

    // 3. Announce the new user to everyone else
    broadcast({ type: 'userJoined', user: { id: userId, name: userName, color: userColor } }, userId);

    // 4. Send the current active canvas state (history up to the current index) to the new user
    const initialHistory = operationHistory.slice(0, historyIndex + 1);
    ws.send(JSON.stringify({ type: 'history', operations: initialHistory }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(userId, data);
        } catch (e) {
            // Error handling for invalid JSON payload
        }
    });

    ws.on('close', () => {
        users.delete(userId);
        broadcast({ type: 'userLeft', userId });
    });
});

// --- Message Routing Logic ---

function handleMessage(userId, data) {
    switch(data.type) {
        case 'draw':
            // 1. Clear future (redo) operations
            operationHistory.splice(historyIndex + 1, operationHistory.length);
            
            // 2. Add the new operation
            operationHistory.push(data.operation);
            
            // 3. Update the active pointer
            historyIndex = operationHistory.length - 1;

            // 4. Broadcast the operation for immediate client rendering (excluding the sender)
            broadcast(data, userId);

            // 5. CRITICAL FIX: After any new drawing, broadcast the full state
            // to ensure remote clients have the correct array length for their Redo logic.
            broadcastHistoryState(); 
            break;

        case 'cursor':
            const user = users.get(userId);
            broadcast({
                type: 'cursor',
                userId,
                userName: user.name,
                color: user.color,
                x: data.x,
                y: data.y
            }, userId);
            break;

        case 'undo':
            if (historyIndex >= 0) {
                historyIndex--; // Move pointer back
                broadcastHistoryState(); 
            }
            break;

        case 'redo':
            if (historyIndex < operationHistory.length - 1) {
                historyIndex++; // Move pointer forward
                broadcastHistoryState();
            }
            break;

        case 'clear':
            operationHistory = [];
            historyIndex = -1;
            broadcast({ type: 'clear' });
            break;
    }
}

// --- Server Initialization ---

server.listen(3000, () => {
    console.log('Server running on port 3000');
});