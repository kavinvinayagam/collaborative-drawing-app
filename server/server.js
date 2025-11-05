// server/server.js - Express + WebSocket Server
const express = require('express');
const WebSocket = require('ws');
const http = require('http');

function generateUserId() {
    return Math.random().toString(36).substr(2, 9);
}

function assignUserColor() {
    // Pick a random color from a list
    const colors = ['#e57373', '#64b5f6', '#81c784', '#ffd54f', '#ba68c8', '#4db6ac'];
    return colors[Math.floor(Math.random() * colors.length)];
}




const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected users
const users = new Map();
// Store operation history
const operationHistory = [];

wss.on('connection', (ws) => {
    // Generate user ID and assign color
    const userId = generateUserId();
    const userColor = assignUserColor();
    const userName = `User${userId.substr(0, 4)}`;
    
    users.set(userId, {
        id: userId,
        ws: ws,
        name: userName,
        color: userColor
    });
    
    // Send initialization data
    ws.send(JSON.stringify({
        type: 'init',
        userId: userId,
        color: userColor
    }));
    
    // Send existing users
    const usersList = Array.from(users.values()).map(u => ({
        id: u.id,
        name: u.name,
        color: u.color
    }));
    ws.send(JSON.stringify({
        type: 'usersList',
        users: usersList
    }));
    
    // Broadcast new user to others
    broadcast({
        type: 'userJoined',
        user: { id: userId, name: userName, color: userColor }
    }, userId);
    
    // Send operation history to new user
    ws.send(JSON.stringify({
        type: 'history',
        operations: operationHistory
    }));
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        handleMessage(userId, data);
    });
    
    ws.on('close', () => {
        users.delete(userId);
        broadcast({
            type: 'userLeft',
            userId: userId
        });
    });
});

function handleMessage(userId, data) {
    switch(data.type) {
        case 'draw':
            // Add to history
            operationHistory.push(data.operation);
            // Broadcast to all other users
            broadcast(data, userId);
            break;
            
        case 'cursor':
            // Broadcast cursor position
            const user = users.get(userId);
            broadcast({
                type: 'cursor',
                userId: userId,
                userName: user.name,
                color: user.color,
                x: data.x,
                y: data.y
            }, userId);
            break;
            
        case 'undo':
        case 'redo':
            // Handle global undo/redo (complex)
            // Requires operation transformation
            break;
            
        case 'clear':
            operationHistory = [];
            broadcast({ type: 'clear' });
            break;
    }
}

function broadcast(data, excludeUserId = null) {
    users.forEach((user, id) => {
        if (id !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(JSON.stringify(data));
        }
    });
}

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
