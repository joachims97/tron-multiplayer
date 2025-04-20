// Connection and lobby UI logic
let socket;
let roomId;
let playerId;
let otherPlayerId;
let peerConnection;
let dataChannel;
let gameStarted = false;

// Initialize socket connection
function initSocket() {
  socket = io();
  
  socket.on('connect', () => {
    playerId = socket.id;
    document.getElementById('connection-status').textContent = 'Connected';
  });
  
  socket.on('player-joined', (data) => {
    updatePlayerList(data.players);
    
    // If this is the second player, initiate WebRTC connection
    if (Object.keys(data.players).length === 2) {
      const otherPlayer = Object.keys(data.players).find(id => id !== playerId);
      otherPlayerId = otherPlayer;
      if (!peerConnection) {
        createPeerConnection(otherPlayer, true);
      }
    }
  });
  
  socket.on('ready-update', (data) => {
    updatePlayerList(data.players);
  });
  
  socket.on('game-start', (data) => {
    startGame(data);
  });
  
  socket.on('player-left', (data) => {
    if (gameStarted) {
      showMessage('Other player disconnected');
      endGame();
    } else {
      updatePlayerList({}); // Clear list
    }
  });
  
  socket.on('room-full', () => {
    showMessage('Room is full, please try another room ID');
  });
  
  // Handle WebRTC signaling
  socket.on('signal', async (data) => {
    if (!peerConnection) {
      createPeerConnection(data.from, false);
    }
    
    try {
      if (data.signal.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', {
          to: data.from,
          signal: answer
        });
      } else if (data.signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
      } else if (data.signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal));
      }
    } catch (err) {
      console.error('Signal error:', err);
    }
  });
}

// Join game room
function joinRoom() {
  const roomInput = document.getElementById('room-id');
  const nameInput = document.getElementById('player-name');
  
  roomId = roomInput.value.trim();
  const playerName = nameInput.value.trim();
  
  if (!roomId || !playerName) {
    showMessage('Please enter room ID and your name');
    return;
  }
  
  socket.emit('join-room', {
    roomId,
    playerName
  });
  
  // Hide join UI, show lobby
  document.getElementById('join-container').style.display = 'none';
  document.getElementById('lobby-container').style.display = 'block';
  document.getElementById('room-id-display').textContent = roomId;
}

// Set player ready status
function setReady() {
  socket.emit('player-ready');
  document.getElementById('ready-btn').disabled = true;
  document.getElementById('ready-btn').textContent = 'Ready ✓';
}

// Update player list in the UI
function updatePlayerList(players) {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  
  Object.values(players).forEach(player => {
    const item = document.createElement('li');
    item.textContent = `${player.name} ${player.ready ? '(Ready)' : '(Not Ready)'}`;
    list.appendChild(item);
  });
}

// Create WebRTC peer connection
function createPeerConnection(remotePeerId, isInitiator) {
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  peerConnection = new RTCPeerConnection(configuration);
  
  // Set up data channel
  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel('gameData');
    setupDataChannel();
  } else {
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel();
    };
  }
  
  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        to: remotePeerId,
        signal: {
          candidate: event.candidate
        }
      });
    }
  };
  
  // Create and send offer if initiator
  if (isInitiator) {
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        socket.emit('signal', {
          to: remotePeerId,
          signal: peerConnection.localDescription
        });
      })
      .catch(err => console.error('Offer creation error:', err));
  }
}

// Set up data channel handlers
function setupDataChannel() {
  dataChannel.onopen = () => {
    console.log('Data channel opened');
  };
  
  dataChannel.onclose = () => {
    console.log('Data channel closed');
  };
  
  dataChannel.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleGameData(data);
  };
}

// Function to handle game data received from other player
function handleGameData(data) {
  if (data.type === 'position') {
    // Update other player's position in the game
    if (window.gameInstance) {
      window.gameInstance.updateOpponentPosition(data.x, data.z, data.angle, data.speed);
    }
  }
}

// Start the game
function startGame(data) {
  gameStarted = true;
  
  // Hide lobby UI, show game canvas
  document.getElementById('lobby-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  
  // Determine player colors (first player blue, second player yellow)
  const players = Object.values(data.players);
  const isFirstPlayer = players[0].id === playerId;
  
  // Initialize game with multiplayer settings
  initializeGame(isFirstPlayer);
}

// End the game and return to lobby
function endGame() {
  gameStarted = false;
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('join-container').style.display = 'block';
  
  // Reset connections
  if (dataChannel) {
    dataChannel.close();
  }
  if (peerConnection) {
    peerConnection.close();
  }
  peerConnection = null;
  dataChannel = null;
}

// Initialize game instance
function initializeGame(isFirstPlayer) {
  // Initialize game with the tron mechanics
  window.gameInstance = new TronGame('game-canvas', isFirstPlayer, sendGameData);
  window.gameInstance.start();
}

// Send game data to other player
function sendGameData(data) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify(data));
  }
}

// Show message in UI
function showMessage(text) {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.style.display = 'block';
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 3000);
}

// Initialize on page load
window.addEventListener('load', initSocket);
document.getElementById('join-btn').addEventListener('click', joinRoom);
document.getElementById('ready-btn').addEventListener('click', setReady);
document.getElementById('share-btn').addEventListener('click', () => {
  const url = window.location.href.split('?')[0];
  navigator.clipboard.writeText(`${url}?room=${roomId}`);
  showMessage('Link copied to clipboard!');
});

// Check URL for room param
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    document.getElementById('room-id').value = roomParam;
  }
});