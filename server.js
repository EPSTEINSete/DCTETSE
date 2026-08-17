const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let users = {};        // socket.id -> nome do usuário
let voiceRooms = {};   // channelId -> Set de socket.ids na call
let channels = [
  { id: 'geral', name: 'geral', type: 'text' },
  { id: 'geral-voz', name: 'Geral', type: 'voice' }
];

function getVoiceMembershipMap() {
  const map = {};
  for (const [channelId, socketIds] of Object.entries(voiceRooms)) {
    map[channelId] = Array.from(socketIds).map(id => ({
      id: id,
      name: users[id] || 'Anônimo'
    }));
  }
  return map;
}

io.on('connection', (socket) => {
  console.log('Usuário conectado:', socket.id);

  socket.on('join', (name) => {
    if (name) users[socket.id] = name;
    socket.emit('channels', channels);
    socket.broadcast.emit('user-joined', { id: socket.id, name: users[socket.id] });
    
    const existingUsers = Object.entries(users)
      .filter(([id]) => id !== socket.id)
      .map(([id, uname]) => ({ id, name: uname }));
    socket.emit('existing-users', existingUsers);
    
    io.emit('voice-membership', getVoiceMembershipMap());
  });

  socket.on('create-channel', ({ name, type }) => {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    if (!channels.find(c => c.id === id)) {
      channels.push({ id, name, type });
      io.emit('channels', channels);
    }
  });

  socket.on('join-voice-channel', ({ channelId, name }) => {
    if (name) {
      users[socket.id] = name;
    }

    // Remove de qualquer outro canal de voz anterior
    for (const chId in voiceRooms) {
      if (voiceRooms[chId].has(socket.id)) {
        voiceRooms[chId].delete(socket.id);
        socket.to(chId).emit('voice-user-left', { id: socket.id });
      }
    }

    if (!voiceRooms[channelId]) {
      voiceRooms[channelId] = new Set();
    }
    voiceRooms[channelId].add(socket.id);

    const peersInChannel = Array.from(voiceRooms[channelId])
      .filter(id => id !== socket.id)
      .map(id => ({ id }));
    
    socket.emit('voice-peers', { channelId, peers: peersInChannel });
    socket.to(channelId).emit('voice-user-joined', { id: socket.id, channelId });

    io.emit('voice-membership', getVoiceMembershipMap());
  });

  socket.on('leave-voice-channel', () => {
    for (const chId in voiceRooms) {
      if (voiceRooms[chId].has(socket.id)) {
        voiceRooms[chId].delete(socket.id);
        socket.to(chId).emit('voice-user-left', { id: socket.id });
      }
    }
    io.emit('voice-membership', getVoiceMembershipMap());
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat-message', ({ channelId, text }) => {
    socket.broadcast.emit('chat-message', { channelId, name: users[socket.id] || 'Anônimo', text });
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id);
    for (const chId in voiceRooms) {
      if (voiceRooms[chId].has(socket.id)) {
        voiceRooms[chId].delete(socket.id);
        socket.to(chId).emit('voice-user-left', { id: socket.id });
      }
    }
    delete users[socket.id];
    io.emit('user-left', { id: socket.id });
    io.emit('voice-membership', getVoiceMembershipMap());
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
