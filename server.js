const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.static(path.join(__dirname, 'public')));

let channels = [
  { id: 'geral', name: 'geral', type: 'text' },
  { id: 'voz-geral', name: 'Geral', type: 'voice' }
];

const users = {}; 
const voiceChannels = {}; 

function getVoiceMembership() {
  const map = {};
  for (const [chId, socketIds] of Object.entries(voiceChannels)) {
    map[chId] = Array.from(socketIds)
      .map(id => users[id])
      .filter(Boolean);
  }
  return map;
}

function broadcastVoiceMembership() {
  io.emit('voice-membership', getVoiceMembership());
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    users[socket.id] = { id: socket.id, name };

    const otherUsers = Object.values(users).filter(u => u.id !== socket.id);
    socket.emit('existing-users', otherUsers);
    socket.broadcast.emit('user-joined', { id: socket.id, name });

    socket.emit('channels', channels);
    socket.join('text-geral');
    broadcastVoiceMembership();
  });

  socket.on('create-channel', ({ name, type }) => {
    const id = (type === 'voice' ? 'voz-' : 'text-') + Date.now();
    channels.push({ id, name, type });
    io.emit('channels', channels);
  });

  socket.on('switch-channel', (channelId) => {
    channels.forEach(c => {
      if (c.type === 'text') socket.leave('text-' + c.id);
    });
    socket.join('text-' + channelId);
  });

  socket.on('chat-message', ({ channelId, text }) => {
    const user = users[socket.id];
    if (!user) return;
    socket.to('text-' + channelId).emit('chat-message', {
      name: user.name,
      text,
      channelId
    });
  });

  socket.on('join-voice-channel', (channelId) => {
    leaveCurrentVoiceChannel(socket);

    if (!voiceChannels[channelId]) {
      voiceChannels[channelId] = new Set();
    }

    const currentPeers = Array.from(voiceChannels[channelId])
      .map(id => users[id])
      .filter(Boolean);

    voiceChannels[channelId].add(socket.id);
    socket.voiceChannelId = channelId;

    socket.emit('voice-peers', {
      channelId,
      peers: currentPeers
    });

    socket.to('vroom-' + channelId).emit('voice-user-joined', {
      id: socket.id,
      channelId
    });

    socket.join('vroom-' + channelId);
    broadcastVoiceMembership();
  });

  socket.on('leave-voice-channel', () => {
    leaveCurrentVoiceChannel(socket);
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', {
      from: socket.id,
      data
    });
  });

  socket.on('disconnect', () => {
    leaveCurrentVoiceChannel(socket);
    socket.broadcast.emit('user-left', { id: socket.id });
    delete users[socket.id];
  });
});

function leaveCurrentVoiceChannel(socket) {
  const chId = socket.voiceChannelId;
  if (!chId) return;

  if (voiceChannels[chId]) {
    voiceChannels[chId].delete(socket.id);
    if (voiceChannels[chId].size === 0) {
      delete voiceChannels[chId];
    }
  }

  socket.leave('vroom-' + chId);
  socket.to('vroom-' + chId).emit('voice-user-left', { id: socket.id });
  delete socket.voiceChannelId;
  broadcastVoiceMembership();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
