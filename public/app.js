const socket = io();

let myName = '';
let localAudioStream = null;
let localScreenStream = null;
let sharingScreen = false;
let currentTextChannel = 'geral';
let currentVoiceChannel = null;
let channels = {};            
let voiceMembershipMap = {};  

const peers = {};        
const remoteUsers = {};  
const peerGainNodes = {}; 
const peerVolumes = {};   
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const screenBtn = document.getElementById('screen-btn');
const usersList = document.getElementById('users');
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const screenGrid = document.getElementById('screen-grid');
const textChannelListEl = document.getElementById('text-channel-list');
const voiceChannelListEl = document.getElementById('voice-channel-list');
const addTextChannelBtn = document.getElementById('add-text-channel-btn');
const addVoiceChannelBtn = document.getElementById('add-voice-channel-btn');
const channelTitle = document.getElementById('channel-title');

// STUN servers públicos configurados para atravessar conexões HTTPS
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// ---------- Entrar no app ----------
joinBtn.onclick = doJoin;
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) return;
  myName = name;
  socket.emit('join', name);
  loginScreen.style.display = 'none';
  appScreen.style.display = 'block';
  renderUsers();
}

// ---------- Canais (texto e voz) ----------
addTextChannelBtn.onclick = () => {
  const name = prompt('Nome do novo canal de texto:');
  if (name && name.trim()) socket.emit('create-channel', { name: name.trim(), type: 'text' });
};

addVoiceChannelBtn.onclick = () => {
  const name = prompt('Nome do novo canal de voz:');
  if (name && name.trim()) socket.emit('create-channel', { name: name.trim(), type: 'voice' });
};

socket.on('channels', (list) => {
  channels = {};
  list.forEach(c => { channels[c.id] = { name: c.name, type: c.type }; });
  if (!channels[currentTextChannel] || channels[currentTextChannel].type !== 'text') {
    switchTextChannel('geral');
  } else {
    renderChannels();
  }
});

socket.on('channel-deleted', (id) => {
  if (id === currentTextChannel) switchTextChannel('geral');
});

socket.on('force-leave-voice', (channelId) => {
  if (currentVoiceChannel === channelId) leaveVoiceChannel(true);
});

socket.on('channel-history', ({ channelId, messages }) => {
  if (channelId !== currentTextChannel) return;
  messagesDiv.innerHTML = '';
  messages.forEach(m => addMessage(m.name, m.text));
});

function switchTextChannel(id) {
  if (!channels[id] || channels[id].type !== 'text') id = 'geral';
  currentTextChannel = id;
  channelTitle.textContent = 'EPSTEIN — #' + channels[id].name;
  messagesDiv.innerHTML = '';
  socket.emit('switch-channel', id);
  renderChannels();
}

function renderChannels() {
  textChannelListEl.innerHTML = '';
  voiceChannelListEl.innerHTML = '';

  Object.entries(channels).forEach(([id, c]) => {
    if (c.type === 'text') {
      const li = document.createElement('li');
      li.className = id === currentTextChannel ? 'active' : '';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'channel-name';
      nameSpan.textContent = c.name;
      nameSpan.onclick = () => switchTextChannel(id);
      li.appendChild(nameSpan);

      if (id !== 'geral') {
        const del = document.createElement('span');
        del.className = 'delete-channel';
        del.textContent = '✕';
        del.title = 'Apagar canal';
        del.onclick = (e) => {
          e.stopPropagation();
          if (confirm(`Apagar o canal "#${c.name}"?`)) socket.emit('delete-channel', id);
        };
        li.appendChild(del);
      }

      textChannelListEl.appendChild(li);
    } else {
      const li = document.createElement('li');
      li.className = 'voice-channel' + (id === currentVoiceChannel ? ' active' : '');

      const row = document.createElement('div');
      row.className = 'voice-channel-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'channel-name';
      nameSpan.textContent = '🔊 ' + c.name + (id === currentVoiceChannel ? ' (conectado)' : '');
      nameSpan.onclick = () => toggleVoiceChannel(id);
      row.appendChild(nameSpan);

      if (id !== 'voz-geral') {
        const del = document.createElement('span');
        del.className = 'delete-channel';
        del.textContent = '✕';
        del.title = 'Apagar canal';
        del.onclick = (e) => {
          e.stopPropagation();
          if (confirm(`Apagar o canal de voz "${c.name}"?`)) socket.emit('delete-channel', id);
        };
        row.appendChild(del);
      }

      li.appendChild(row);

      const members = voiceMembershipMap[id] || [];
      if (members.length) {
        const memDiv = document.createElement('div');
        memDiv.className = 'voice-members';
        memDiv.textContent = members.map(m => m.name).join(', ');
        li.appendChild(memDiv);
      }

      voiceChannelListEl.appendChild(li);
    }
  });
}

// ---------- Entrar/sair de canal de voz ----------
function toggleVoiceChannel(id) {
  if (currentVoiceChannel === id) {
    leaveVoiceChannel(true);
  } else {
    joinVoiceChannel(id);
  }
}

async function joinVoiceChannel(id) {
  if (currentVoiceChannel) leaveVoiceChannel(false);

  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Erro ao acessar o microfone: ' + err.message);
    return;
  }

  getAudioCtx();

  currentVoiceChannel = id;
  socket.emit('join-voice-channel', id);
  screenBtn.disabled = false;
  renderChannels();
}

function leaveVoiceChannel(clearChannel) {
  if (!currentVoiceChannel) return;
  socket.emit('leave-voice-channel');

  Object.keys(peers).forEach(id => {
    if (peers[id]) peers[id].close();
    delete peers[id];
    delete peerGainNodes[id];
    removeScreenTile(id);
  });

  if (sharingScreen) stopScreenShare();

  if (clearChannel) {
    currentVoiceChannel = null;
    if (localAudioStream) {
      localAudioStream.getTracks().forEach(t => t.stop());
      localAudioStream = null;
    }
    screenBtn.disabled = true;
  }
  renderUsers();
  renderChannels();
}

socket.on('voice-membership', (map) => {
  voiceMembershipMap = map;
  renderChannels();
});

socket.on('voice-peers', ({ channelId, peers: peerList }) => {
  if (channelId !== currentVoiceChannel) return;
  peerList.forEach(p => createPeerConnection(p.id));
  renderUsers();
});

socket.on('voice-user-joined', ({ id, channelId }) => {
  if (channelId !== currentVoiceChannel) return;
  createPeerConnection(id);
  renderUsers();
});

socket.on('voice-user-left', ({ id }) => {
  if (peers[id]) { peers[id].close(); delete peers[id]; }
  delete peerGainNodes[id];
  removeScreenTile(id);
  renderUsers();
});

// ---------- Lista geral de usuários online ----------
function renderUsers() {
  usersList.innerHTML = '';
  const me = document.createElement('li');
  me.textContent = myName + ' (você)';
  usersList.appendChild(me);

  Object.entries(remoteUsers).forEach(([id, name]) => {
    const li = document.createElement('li');
    li.className = 'user-item';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    li.appendChild(nameSpan);

    if (peerGainNodes[id]) {
      const vol = document.createElement('input');
      vol.type = 'range';
      vol.min = 0;
      vol.max = 200;
      vol.value = peerVolumes[id] || 100;
      vol.className = 'volume-slider';
      vol.title = `Volume de ${name}: ${vol.value}%`;
      vol.oninput = () => {
        const v = parseInt(vol.value, 10);
        peerVolumes[id] = v;
        vol.title = `Volume de ${name}: ${v}%`;
        if (peerGainNodes[id]) peerGainNodes[id].gain.value = v / 100;
      };
      li.appendChild(vol);
    }

    usersList.appendChild(li);
  });
}

socket.on('existing-users', (list) => {
  list.forEach(u => { remoteUsers[u.id] = u.name; });
  renderUsers();
});

socket.on('user-joined', ({ id, name }) => {
  remoteUsers[id] = name;
  renderUsers();
  addSystemMessage(`${name} entrou.`);
});

socket.on('user-left', ({ id, name }) => {
  delete remoteUsers[id];
  if (peers[id]) { peers[id].close(); delete peers[id]; }
  delete peerGainNodes[id];
  removeScreenTile(id);
  renderUsers();
  addSystemMessage(`${name} saiu.`);
});

// ---------- Chat de texto ----------
socket.on('chat-message', (msg) => {
  if (msg.channelId !== currentTextChannel) return;
  addMessage(msg.name, msg.text);
});

chatForm.onsubmit = (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', { channelId: currentTextChannel, text });
  addMessage(myName, text);
  chatInput.value = '';
};

function addMessage(name, text) {
  const div = document.createElement('div');
  div.className = 'message';
  const strong = document.createElement('strong');
  strong.textContent = name + ': ';
  div.appendChild(strong);
  div.appendChild(document.createTextNode(text));
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ---------- WebRTC ----------
function createPeerConnection(peerId) {
  if (peers[peerId]) return peers[peerId];
  const pc = new RTCPeerConnection(rtcConfig);
  peers[peerId] = pc;

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal', { to: peerId, data: { candidate: e.candidate } });
  };

  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (e.track.kind === 'audio') {
      const ctx = getAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = (peerVolumes[peerId] || 100) / 100;
      source.connect(gain);
      gain.connect(ctx.destination);
      peerGainNodes[peerId] = gain;
      renderUsers();
    } else if (e.track.kind === 'video') {
      addScreenTile(peerId, stream, false);
    }
  };

  pc.onnegotiationneeded = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { to: peerId, data: { sdp: pc.localDescription } });
    } catch (err) { console.error(err); }
  };

  if (localAudioStream) {
    localAudioStream.getTracks().forEach(t => pc.addTrack(t, localAudioStream));
  }
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => pc.addTrack(t, localScreenStream));
  }

  return pc;
}

socket.on('signal', async ({ from, data }) => {
  if (!currentVoiceChannel) return;
  let pc = peers[from];
  if (!pc) pc = createPeerConnection(from);

  if (data.sdp) {
    const desc = new RTCSessionDescription(data.sdp);
    if (desc.type === 'offer') {
      await pc.setRemoteDescription(desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
    } else {
      await pc.setRemoteDescription(desc);
    }
  } else if (data.candidate) {
    try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (err) { console.error(err); }
  }
});

// ---------- Compartilhar tela ----------
screenBtn.onclick = async () => {
  if (!currentVoiceChannel) {
    alert('Entre em um canal de voz para compartilhar sua tela.');
    return;
  }
  if (!sharingScreen) {
    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      Object.values(peers).forEach(pc => {
        localScreenStream.getTracks().forEach(t => pc.addTrack(t, localScreenStream));
      });
      addScreenTile('me', localScreenStream, true);
      sharingScreen = true;
      screenBtn.textContent = '🛑 Parar compartilhamento';
      localScreenStream.getVideoTracks()[0].onended = stopScreenShare;
    } catch (err) {
      // Cancelado pelo usuário
    }
  } else {
    stopScreenShare();
  }
};

function stopScreenShare() {
  if (!localScreenStream) return;
  localScreenStream.getTracks().forEach(t => t.stop());
  Object.values(peers).forEach(pc => {
    pc.getSenders().forEach(s => { if (s.track && s.track.kind === 'video') pc.removeTrack(s); });
  });
  removeScreenTile('me');
  localScreenStream = null;
  sharingScreen = false;
  screenBtn.textContent = '🖥️ Compartilhar tela';
}

function addScreenTile(id, stream, isLocal) {
  let tile = document.getElementById('screen-' + id);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'screen-tile';
    tile.id = 'screen-' + id;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    video.onclick = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        video.requestFullscreen().catch(() => {});
      }
    };
    tile.appendChild(video);

    const label = document.createElement('div');
    label.className = 'screen-label';
    label.textContent = isLocal ? 'Você' : (remoteUsers[id] || 'Alguém');
    tile.appendChild(label);

    const hint = document.createElement('div');
    hint.className = 'screen-hint';
    hint.textContent = 'clique p/ tela cheia';
    tile.appendChild(hint);

    screenGrid.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}

function removeScreenTile(id) {
  const tile = document.getElementById('screen-' + id);
  if (tile) tile.remove();
}