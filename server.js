const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};
function getRoom(code) {
  if (!rooms[code]) {
    rooms[code] = { code, players: {}, monsterState: { rageMultiplier: 1.0, stunTimer: 0 } };
  }
  return rooms[code];
}
function leaveRoom(socket) {
  const code = socket.roomCode;
  if (!code) return;
  const room = rooms[code];
  socket.leave(code);
  socket.roomCode = null;
  if (!room) return;
  delete room.players[socket.id];
  socket.to(code).emit('playerLeft', socket.id);
  if (Object.keys(room.players).length === 0) delete rooms[code];
}

io.on('connection', function(socket) {
  socket.on('joinRoom', function(data) {
    let code = String((data && data.code) || '').toUpperCase().trim() || 'PUBLIC';
    leaveRoom(socket);
    socket.join(code);
    socket.roomCode = code;
    const room = getRoom(code);
    room.players[socket.id] = { id: socket.id, name: 'Player', x: 0, z: 0, yaw: 0 };
    socket.emit('roomJoined', { code, players: room.players, monsterState: room.monsterState });
    socket.to(code).emit('playerJoined', room.players[socket.id]);
  });
  
  socket.on('playerMove', function(data) {
    const code = socket.roomCode;
    if (!code || !rooms[code] || !rooms[code].players[socket.id]) return;
    rooms[code].players[socket.id].x = data.x;
    rooms[code].players[socket.id].z = data.z;
    rooms[code].players[socket.id].yaw = data.yaw;
    socket.to(code).emit('playerMoved', rooms[code].players[socket.id]);
  });
  
  socket.on('playerShoot', function(data) {
    if (socket.roomCode) socket.to(socket.roomCode).emit('playerShot', Object.assign({ id: socket.id }, data));
  });
  
  socket.on('collectNotebook', function(notebookId) {
    if (socket.roomCode) io.to(socket.roomCode).emit('notebookCollected', { id: socket.id, notebookId });
  });
  
  socket.on('hitMonster', function() {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].monsterState.stunTimer = 30;
    if (Math.random() < 1 / 3) {
      rooms[code].monsterState.rageMultiplier = Math.min(3.0, rooms[code].monsterState.rageMultiplier * 1.25);
    }
    io.to(code).emit('monsterSynced', rooms[code].monsterState);
  });

  // ★ 新增：互坑模式，转发打队友的事件
  socket.on('hitPlayer', function(targetId) {
    const code = socket.roomCode;
    if (!code) return;
    io.to(code).emit('playerStunned', { targetId: targetId });
  });
  
  socket.on('disconnect', function() { leaveRoom(socket); });
});

server.listen(3000, function() {
  console.log('✅ Server running on port 3000');
});
