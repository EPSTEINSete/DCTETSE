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

muteBtn.onclick = () => {
  if (!localAudioStream) return;
  isMuted = !isMuted;
  localAudioStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
  if (isMuted) {
    muteBtn.textContent = '🔇';
    muteBtn.classList.add('active-danger');
  } else {
    muteBtn.textContent = '🎙️';
    muteBtn.classList.remove('active-danger');
  }
};

disconnectVoiceBtn.onclick = () => {
  leaveVoiceChannel(true);
};

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
    if (c.type === 'text') {
      const li = document.createElement('li');
      li.className = 'channel-item' + (id === currentTextChannel ? ' active' : '');
      li.textContent = '# ' + c.name;
      li.onclick = () => switchTextChannel(id);
      textChannelListEl.appendChild(li);
    } else {
      const voiceContainer = document.createElement('div');
      voiceContainer.style.marginBottom = '4px';

      const li = document.createElement('div');
      li.className = 'channel-item' + (id === currentVoiceChannel ? ' active' : '');
      li.textContent = '🔊 ' + c.name;
      li.onclick = () => toggleVoiceChannel(id);
      voiceContainer.appendChild(li);

      const members = voiceMembershipMap[id] || [];
      if (members.length > 0) {
        const memListDiv = document.createElement('div');
        memListDiv.style.paddingLeft = '16px';
        memListDiv.style.display = 'flex';
        memListDiv.style.flexDirection = 'column';
        memListDiv.style.gap = '2px';
        memListDiv.style.marginTop = '2px';

        members.forEach(m => {
          const memItem = document.createElement('div');
          memItem.style.display = 'flex';
          memItem.style.alignItems = 'center';
          memItem.style.gap = '6px';
          memItem.style.padding = '4px 6px';
          memItem.style.borderRadius = '4px';
          memItem.style.fontSize = '13px';
          memItem.style.color = '#949ba4';

          const avatarMini = document.createElement('div');
          avatarMini.textContent = (m.name || 'U').charAt(0).toUpperCase();
          avatarMini.style.width = '20px';
          avatarMini.style.height = '20px';
          avatarMini.style.borderRadius = '50%';
          avatarMini.style.background = '#5865f2';
          avatarMini.style.color = '#fff';
          avatarMini.style.display = 'flex';
          avatarMini.style.alignItems = 'center';
          avatarMini.style.justifyContent = 'center';
          avatarMini.style.fontSize = '10px';
          avatarMini.style.fontWeight = 'bold';
          avatarMini.style.flexShrink = '0';

          const nameSpan = document.createElement('span');
          nameSpan.textContent = m.name;
          nameSpan.style.whiteSpace = 'nowrap';
          nameSpan.style.overflow = 'hidden';
          nameSpan.style.textOverflow = 'ellipsis';

          memItem.appendChild(avatarMini);
          memItem.appendChild(nameSpan);
          memListDiv.appendChild(memItem);
        });

        voiceContainer.appendChild(memListDiv);
      }

      voiceChannelListEl.appendChild(voiceContainer);
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

  if (!myName) {
    myName = nameInput.value.trim() || 'Usuário';
  }

  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Acesso ao microfone foi recusado ou dispositivo não encontrado.');
    return;
  }

  getAudioCtx();
  currentVoiceChannel = id;
  socket.emit('join-voice-channel', { channelId: id, name: myName });
  
  playJoinSound();

  screenBtn.disabled = false;
  voiceStatusPanel.style.display = 'block';
  connectedChannelName.textContent = '/ ' + (channels[id] ? channels[id].name : 'Voz');
  renderChannels();
}

function leaveVoiceChannel(clearChannel) {
  if (!currentVoiceChannel) return;

  playLeaveSound();

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
    const stream = e.streams[0] || new MediaStream([e.track]);
    if (e.track.kind === 'audio') {
      attachAudioTrack(peerId, stream);
    } else if (e.track.kind === 'video') {
      addScreenTile(peerId, stream, false);
      e.track.onended = () => removeScreenTile(peerId);
    }
  };

  pc.onnegotiationneeded = async () => {
    try {
      sendOffer(peerId);
    } catch (err) {}
  };

  if (localAudioStream) {
    localAudioStream.getTracks().forEach(t => pc.addTrack(t, localAudioStream));
  }
  if (localScreenStream) {
    localScreenStream.getVideoTracks().forEach(t => pc.addTrack(t, localScreenStream));
  }

  if (isInitiator) {
    sendOffer(peerId);
  }

  return pc;
}

async function sendOffer(peerId) {
  const pc = peers[peerId];
  if (!pc) return;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: peerId, data: { sdp: pc.localDescription } });
  } catch (err) {}
}

socket.on('signal', async ({ from, data }) => {
  if (!currentVoiceChannel) return;
  let pc = peers[from];
  if (!pc) pc = createPeerConnection(from, false);

  if (data.type === 'screen-stopped') {
    removeScreenTile(from);
    return;
  }

  if (data.sdp) {
    try {
      const desc = new RTCSessionDescription(data.sdp);
      if (desc.type === 'offer') {
        await pc.setRemoteDescription(desc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
      } else if (desc.type === 'answer') {
        await pc.setRemoteDescription(desc);
      }
    } catch (err) {}
  } else if (data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {}
  }
});

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

screenBtn.onclick = async () => {
  if (!currentVoiceChannel) return;

  if (sharingScreen) {
    stopScreenShare();
    return;
  }

  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true, 
      audio: false // Correção: Apenas vídeo para não conflitar com a voz do microfone
    });
    sharingScreen = true;
    screenBtn.textContent = '🛑';

    localScreenStream.getVideoTracks()[0].onended = stopScreenShare;

    for (const peerId in peers) {
      const pc = peers[peerId];
      localScreenStream.getVideoTracks().forEach(t => pc.addTrack(t, localScreenStream));
      sendOffer(peerId);
    }

    addScreenTile('me', localScreenStream, true);
  } catch (err) {
    sharingScreen = false;
    screenBtn.textContent = '🖥️';
  }
};

function stopScreenShare() {
  if (!localScreenStream) return;

  localScreenStream.getTracks().forEach(t => t.stop());

  for (const peerId in peers) {
    const pc = peers[peerId];
    pc.getSenders().forEach(s => {
      if (s.track && s.track.kind === 'video') {
        pc.removeTrack(s);
      }
    });
    socket.emit('signal', { to: peerId, data: { type: 'screen-stopped' } });
    sendOffer(peerId);
  }

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
    video.muted = isLocal;
    tile.appendChild(video);

    const label = document.createElement('div');
    label.className = 'screen-label';
    label.textContent = (isLocal ? 'Você' : (remoteUsers[id] || 'Alguém')) + ' (Clique para Tela Cheia)';
    tile.appendChild(label);

    tile.onclick = () => {
      if (!document.fullscreenElement) {
        tile.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

    screenGrid.appendChild(tile);
  }
  const videoEl = tile.querySelector('video');
  videoEl.srcObject = stream;
  videoEl.play().catch(() => {});
}

function removeScreenTile(id) {
  const tile = document.getElementById('screen-' + id);
  if (tile) tile.remove();
}

function playJoinSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.2);
}

function playLeaveSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(360, now + 0.12);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.2);
}
