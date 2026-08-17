const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const users = {}; // socket.id -> { name, voiceChannel }
const channels = {
  geral: { name: 'geral', type: 'text', messages: [] },
  'voz-geral': { name: 'Geral', type: 'voice' }
};

function channelList() {
  return Object.entries(channels).map(([id, c]) => ({ id, name: c.name, type: c.type }));
}

function voiceRoom(channelId) { return 'voice-' + channelId; }

function voiceMembership() {
  const map = {};
  Object.entries(users).forEach(([id, u]) => {
    if (u.voiceChannel) {
      if (!map[u.voiceChannel]) map[u.voiceChannel] = [];
      map[u.voiceChannel].push({ id, name: u.name });
    }
  });
  return map;
}

function leaveVoice(socket) {
  const user = users[socket.id];
  if (!user || !user.voiceChannel) return;
  const channelId = user.voiceChannel;
  user.voiceChannel = null;
  socket.leave(voiceRoom(channelId));
  socket.to(voiceRoom(channelId)).emit('voice-user-left', { id: socket.id, channelId });
  io.emit('voice-membership', voiceMembership());
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    users[socket.id] = { name: name || 'Anônimo', voiceChannel: null };

    const existing = Object.entries(users)
      .filter(([id]) => id !== socket.id)
      .map(([id, u]) => ({ id, name: u.name }));
    socket.emit('existing-users', existing);
    socket.broadcast.emit('user-joined', { id: socket.id, name: users[socket.id].name });

    socket.emit('channels', channelList());
    socket.emit('voice-membership', voiceMembership());
  });

  socket.on('switch-channel', (channelId) => {
    if (!channels[channelId] || channels[channelId].type !== 'text') return;
    socket.emit('channel-history', { channelId, messages: channels[channelId].messages });
  });

  socket.on('create-channel', ({ name, type }) => {
    const clean = (name || '').trim().slice(0, 30);
    if (!clean) return;
    const t = type === 'voice' ? 'voice' : 'text';
    const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
    channels[id] = t === 'text' ? { name: clean, type: t, messages: [] } : { name: clean, type: t };
    io.emit('channels', channelList());
  });

  socket.on('delete-channel', (channelId) => {
    if (channelId === 'geral' || channelId === 'voz-geral' || !channels[channelId]) return;
    const wasVoice = channels[channelId].type === 'voice';
    delete channels[channelId];
    if (wasVoice) {
      Object.entries(users).forEach(([id, u]) => {
        if (u.voiceChannel === channelId) {
          u.voiceChannel = null;
          io.to(id).emit('force-leave-voice', channelId);
        }
      });
    }
    io.emit('channels', channelList());
    io.emit('channel-deleted', channelId);
    io.emit('voice-membership', voiceMembership());
  });

  socket.on('chat-message', ({ channelId, text }) => {
    const user = users[socket.id];
    if (!user || !channels[channelId] || channels[channelId].type !== 'text') return;
    const msg = { name: user.name, text, channelId };
    channels[channelId].messages.push(msg);
    if (channels[channelId].messages.length > 50) channels[channelId].messages.shift();
    socket.broadcast.emit('chat-message', msg);
  });

  socket.on('join-voice-channel', (channelId) => {
    const user = users[socket.id];
    if (!user || !channels[channelId] || channels[channelId].type !== 'voice') return;
    if (user.voiceChannel === channelId) return;
    if (user.voiceChannel) leaveVoice(socket);

    user.voiceChannel = channelId;
    socket.join(voiceRoom(channelId));

    const peersInChannel = Object.entries(users)
      .filter(([id, u]) => id !== socket.id && u.voiceChannel === channelId)
      .map(([id, u]) => ({ id, name: u.name }));
    socket.emit('voice-peers', { channelId, peers: peersInChannel });
    socket.to(voiceRoom(channelId)).emit('voice-user-joined', { id: socket.id, name: user.name, channelId });
    io.emit('voice-membership', voiceMembership());
  });

  socket.on('leave-voice-channel', () => leaveVoice(socket));

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    leaveVoice(socket);
    const user = users[socket.id];
    delete users[socket.id];
    if (user) io.emit('user-left', { id: socket.id, name: user.name });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));