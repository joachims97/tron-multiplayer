const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game rooms storage
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Create or join a game room
  socket.on('join-room', ({ roomId, playerName }) => {
    console.log(`${playerName} trying to join room ${roomId}`);
    
    // Create room if doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {},
        readyCount: 0
      };
    }
    
    // Room full check
    if (Object.keys(rooms[roomId].players).length >= 2) {
      socket.emit('room-full');
      return;
    }
    
    // Add player to room
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: playerName,
      ready: false
    };
    
    // Notify room
    io.to(roomId).emit('player-joined', {
      playerId: socket.id,
      playerName,
      players: rooms[roomId].players
    });
    
    // Save room ID in socket for cleanup
    socket.roomId = roomId;
  });
  
  // Player ready
  socket.on('player-ready', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    
    rooms[roomId].players[socket.id].ready = true;
    rooms[roomId].readyCount++;
    
    // Update players about ready status
    io.to(roomId).emit('ready-update', {
      playerId: socket.id,
      players: rooms[roomId].players
    });
    
    // Start game if both players ready
    if (rooms[roomId].readyCount === 2) {
      io.to(roomId).emit('game-start', {
        players: rooms[roomId].players
      });
    }
  });
  
  // Handle WebRTC signaling
  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', {
      from: socket.id,
      signal
    });
  });
  
  // Cleanup on disconnect
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      // Remove player
      if (rooms[roomId].players[socket.id]) {
        if (rooms[roomId].players[socket.id].ready) {
          rooms[roomId].readyCount--;
        }
        delete rooms[roomId].players[socket.id];
      }
      
      // Notify remaining player
      io.to(roomId).emit('player-left', {
        playerId: socket.id
      });
      
      // Clean up empty rooms
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
