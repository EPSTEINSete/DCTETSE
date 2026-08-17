const socket = io();

let myName = '';
let localAudioStream = null;
let localScreenStream = null;
let isMuted = false;
let sharingScreen = false;
let currentTextChannel = 'geral';
let currentVoiceChannel = null;
let channels = {};            
let voiceMembershipMap = {};  

const peers = {};        
const remoteUsers = {};  
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Elementos da UI
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const screenBtn = document.getElementById('screen-btn');
const muteBtn = document.getElementById('mute-btn');
const disconnectVoiceBtn = document.getElementById('disconnect-voice-btn');
const voiceStatusPanel = document.getElementById('voice-status-panel');
const connectedChannelName = document.getElementById('connected-channel-name');
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
const myNameDisplay = document.getElementById('my-name-display');
const myAvatar = document.getElementById('my-avatar');

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Login
joinBtn.onclick = doJoin;
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) return;
  myName = name;
  if (myNameDisplay) myNameDisplay.textContent = name;
  if (myAvatar) myAvatar.textContent = name.charAt(0).toUpperCase();
  socket.emit('join', name);
  loginScreen.style.display = 'none';
  appScreen.style.display = 'flex';
  getAudioCtx();
}

document.body.addEventListener('click', () => {
  getAudioCtx();
}, { once: true });

// Mutar Microfone
muteBtn.onclick = () => {
  if (!localAudioStream) return;
  isMuted = !isMuted;
  localAudioStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
  if (isMuted) {
    muteBtn.textContent = '🔇';
    muteBtn.classList.add('active-danger');
    muteBtn.title = 'Desmutar Microfone';
  } else {
    muteBtn.textContent = '🎙️';
    muteBtn.classList.remove('active-danger');
    muteBtn.title = 'Mutar Microfone';
  }
};

// Desconectar Voz
disconnectVoiceBtn.onclick = () => {
  leaveVoiceChannel(true);
};

// Canais
addTextChannelBtn.onclick = () => {
  const name = prompt('Nome do canal de texto:');
  if (name && name.trim()) socket.emit('create-channel', { name: name.trim(), type: 'text' });
};

addVoiceChannelBtn.onclick = () => {
  const name = prompt('Nome do canal de voz:');
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

function switchTextChannel(id) {
  if (!channels[id] || channels[id].type !== 'text') id = 'geral';
  currentTextChannel = id;
  channelTitle.textContent = '# ' + channels[id].name;
  messagesDiv.innerHTML = '';
  socket.emit('switch-channel', id);
  renderChannels();
}

function renderChannels() {
  textChannelListEl.innerHTML = '';
  voiceChannelListEl.innerHTML = '';

  Object.entries(channels).forEach(([id, c]) => {
    const li = document.createElement('li');
    li.className = 'channel-item' + (id === currentTextChannel || id === currentVoiceChannel ? ' active' : '');
    
    if (c.type === 'text') {
      li.textContent = '# ' + c.name;
      li.onclick = () => switchTextChannel(id);
      textChannelListEl.appendChild(li);
    } else {
      li.textContent = '🔊 ' + c.name;
      li.onclick = () => toggleVoiceChannel(id);
      
      const members = voiceMembershipMap[id] || [];
      if (members.length) {
        const memDiv = document.createElement('div');
        memDiv.className = 'voice-members';
        memDiv.style.fontSize = '0.85em';
        memDiv.style.color = '#b9bbbe';
        memDiv.style.paddingLeft = '10px';
        memDiv.textContent = members.map(m => '• ' + m.name).join(' ');
        li.appendChild(memDiv);
      }
      voiceChannelListEl.appendChild(li);
    }
  });
}

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
    alert('Acesso ao microfone foi recusado ou dispositivo não encontrado.');
    return;
  }

  getAudioCtx();
  currentVoiceChannel = id;
  socket.emit('join-voice-channel', id);
  
  screenBtn.disabled = false;
  voiceStatusPanel.style.display = 'block';
  connectedChannelName.textContent = '/ ' + (channels[id] ? channels[id].name : 'Voz');
  renderChannels();
}

function leaveVoiceChannel(clearChannel) {
  if (!currentVoiceChannel) return;
  socket.emit('leave-voice-channel');

  Object.keys(peers).forEach(id => {
    if (peers[id]) peers[id].close();
    delete peers[id];
    removeAudioElement(id);
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
    voiceStatusPanel.style.display = 'none';
  }
  renderChannels();
}

socket.on('voice-membership', (map) => {
  voiceMembershipMap = map;
  renderChannels();
});

socket.on('voice-peers', ({ channelId, peers: peerList }) => {
  if (channelId !== currentVoiceChannel) return;
  peerList.forEach(p => createPeerConnection(p.id, true));
});

socket.on('voice-user-joined', ({ id, channelId }) => {
  if (channelId !== currentVoiceChannel) return;
  createPeerConnection(id, false);
});

socket.on('voice-user-left', ({ id }) => {
  if (peers[id]) { peers[id].close(); delete peers[id]; }
  removeAudioElement(id);
  removeScreenTile(id);
});

// Lista de usuários no painel direito
function renderUsers() {
  usersList.innerHTML = '';
  const me = document.createElement('li');
  me.className = 'channel-item';
  me.textContent = myName + ' (você)';
  usersList.appendChild(me);

  Object.entries(remoteUsers).forEach(([id, name]) => {
    const li = document.createElement('li');
    li.className = 'channel-item';
    li.textContent = name;
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
});

socket.on('user-left', ({ id }) => {
  delete remoteUsers[id];
  if (peers[id]) { peers[id].close(); delete peers[id]; }
  removeAudioElement(id);
  removeScreenTile(id);
  renderUsers();
});

// Chat de texto
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

// Conexão WebRTC
function createPeerConnection(peerId, isInitiator) {
  if (peers[peerId]) return peers[peerId];
  const pc = new RTCPeerConnection(rtcConfig);
  peers[peerId] = pc;

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('signal', { to: peerId, data: { candidate: e.candidate } });
    }
  };

  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (e.track.kind === 'audio') {
      attachAudioTrack(peerId, stream);
    } else if (e.track.kind === 'video') {
      addScreenTile(peerId, stream, false);
    }
  };

  if (localAudioStream) {
    localAudioStream.getTracks().forEach(t => pc.addTrack(t, localAudioStream));
  }
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => pc.addTrack(t, localScreenStream));
  }

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: peerId, data: { sdp: pc.localDescription } });
      } catch (err) {}
    };
  }

  return pc;
}

function attachAudioTrack(peerId, stream) {
  let audio = document.getElementById('audio-' + peerId);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'audio-' + peerId;
    audio.autoplay = true;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
  audio.play().catch(() => {});
}

function removeAudioElement(peerId) {
  const audio = document.getElementById('audio-' + peerId);
  if (audio) audio.remove();
}

socket.on('signal', async ({ from, data }) => {
  if (!currentVoiceChannel) return;
  let pc = peers[from];
  if (!pc) pc = createPeerConnection(from, false);

  if (data.sdp) {
    const desc = new RTCSessionDescription(data.sdp);
    await pc.setRemoteDescription(desc);
    if (desc.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
    }
  } else if (data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {}
  }
});

// Compartilhamento de Tela
screenBtn.onclick = async () => {
  if (!currentVoiceChannel) return;

  if (sharingScreen) {
    stopScreenShare();
    return;
  }

  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    Object.values(peers).forEach(pc => {
      localScreenStream.getTracks().forEach(t => pc.addTrack(t, localScreenStream));
    });
    addScreenTile('me', localScreenStream, true);
    sharingScreen = true;
    screenBtn.textContent = '🛑';
    localScreenStream.getVideoTracks()[0].onended = stopScreenShare;
  } catch (err) {
    sharingScreen = false;
    screenBtn.textContent = '🖥️';
  }
};

function stopScreenShare() {
  if (!localScreenStream) return;
  localScreenStream.getTracks().forEach(t => t.stop());
  Object.values(peers).forEach(pc => {
    pc.getSenders().forEach(s => {
      if (s.track && s.track.kind === 'video') pc.removeTrack(s);
    });
  });
  removeScreenTile('me');
  localScreenStream = null;
  sharingScreen = false;
  screenBtn.textContent = '🖥️';
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
    tile.appendChild(video);
    const label = document.createElement('div');
    label.className = 'screen-label';
    label.textContent = isLocal ? 'Você' : (remoteUsers[id] || 'Alguém');
    tile.appendChild(label);
    screenGrid.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}

function removeScreenTile(id) {
  const tile = document.getElementById('screen-' + id);
  if (tile) tile.remove();
}
