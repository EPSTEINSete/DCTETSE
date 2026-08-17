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

// Elementos UI
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
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Login
if (joinBtn) joinBtn.onclick = doJoin;
if (nameInput) {
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
}

function doJoin() {
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) return;
  myName = name;
  if (myNameDisplay) myNameDisplay.textContent = name;
  if (myAvatar) myAvatar.textContent = name.charAt(0).toUpperCase();
  socket.emit('join', name);
  if (loginScreen) loginScreen.style.display = 'none';
  if (appScreen) appScreen.style.display = 'flex';
  getAudioCtx();
}

document.body.addEventListener('click', () => {
  getAudioCtx();
}, { once: true });

// Mutar Microfone
if (muteBtn) {
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
}

// Desconectar Voz
if (disconnectVoiceBtn) {
  disconnectVoiceBtn.onclick = () => leaveVoiceChannel(true);
}

// Criar Canais
if (addTextChannelBtn) {
  addTextChannelBtn.onclick = () => {
    const name = prompt('Nome do canal de texto:');
    if (name && name.trim()) socket.emit('create-channel', { name: name.trim(), type: 'text' });
  };
}

if (addVoiceChannelBtn) {
  addVoiceChannelBtn.onclick = () => {
    const name = prompt('Nome do canal de voz:');
    if (name && name.trim()) socket.emit('create-channel', { name: name.trim(), type: 'voice' });
  };
}

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
  if (channelTitle) channelTitle.textContent = '# ' + channels[id].name;
  if (messagesDiv) messagesDiv.innerHTML = '';
  socket.emit('switch-channel', id);
  renderChannels();
}

function renderChannels() {
  if (!textChannelListEl || !voiceChannelListEl) return;
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
      const headerDiv = document.createElement('div');
      headerDiv.style.cursor = 'pointer';
      headerDiv.style.padding = '4px 0';
      headerDiv.textContent = '🔊 ' + c.name;
      
      headerDiv.onclick = (e) => {
        e.stopPropagation();
        toggleVoiceChannel(id);
      };
      
      li.appendChild(headerDiv);
      
      const members = voiceMembershipMap[id] || [];
      if (members.length > 0) {
        const memUl = document.createElement('ul');
        memUl.style.listStyle = 'none';
        memUl.style.paddingLeft = '15px';
        memUl.style.marginTop = '4px';
        memUl.style.fontSize = '0.85em';
        memUl.style.color = '#b9bbbe';

        members.forEach(m => {
          const memLi = document.createElement('li');
          memLi.style.marginBottom = '6px';
          memLi.style.display = 'flex';
          memLi.style.flexDirection = 'column';
          
          const nameSpan = document.createElement('span');
          nameSpan.textContent = '• ' + m.name;
          memLi.appendChild(nameSpan);

          if (m.id !== socket.id) {
            const volContainer = document.createElement('div');
            volContainer.style.display = 'flex';
            volContainer.style.alignItems = 'center';
            volContainer.style.gap = '5px';
            volContainer.style.marginTop = '2px';

            const volIcon = document.createElement('span');
            volIcon.textContent = '🔊';
            volIcon.style.fontSize = '0.8em';

            const volSlider = document.createElement('input');
            volSlider.type = 'range';
            volSlider.min = '0';
            volSlider.max = '1';
            volSlider.step = '0.05';
            
            const existingAudio = document.getElementById('audio-' + m.id);
            volSlider.value = existingAudio ? existingAudio.volume : 1;

            volSlider.style.width = '80px';
            volSlider.style.cursor = 'pointer';

            volSlider.oninput = (e) => {
              e.stopPropagation();
              setPeerVolume(m.id, e.target.value);
            };

            volContainer.appendChild(volIcon);
            volContainer.appendChild(volSlider);
            memLi.appendChild(volContainer);
          }

          memUl.appendChild(memLi);
        });
        li.appendChild(memUl);
      }
      voiceChannelListEl.appendChild(li);
    }
  });
}

function setPeerVolume(peerId, volumeValue) {
  const audio = document.getElementById('audio-' + peerId);
  if (audio) {
    audio.volume = parseFloat(volumeValue);
  }
}

function toggleVoiceChannel(id) {
  if (currentVoiceChannel === id) {
    leaveVoiceChannel(true);
  } else {
    joinVoiceChannel(id);
  }
}

async function joinVoiceChannel(id) {
  if (currentVoiceChannel === id) return;
  if (currentVoiceChannel) leaveVoiceChannel(false);

  localAudioStream = null;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.warn('Microfone não acessível ou sem permissão. Entrando em modo ouvinte.', err);
    }
  }

  getAudioCtx();
  currentVoiceChannel = id;

  if (!voiceMembershipMap[id]) {
    voiceMembershipMap[id] = [];
  }
  if (!voiceMembershipMap[id].some(m => m.id === socket.id)) {
    voiceMembershipMap[id].push({ id: socket.id || 'me', name: myName });
  }

  socket.emit('join-voice-channel', id);
  
  if (screenBtn) screenBtn.disabled = false;
  if (voiceStatusPanel) voiceStatusPanel.style.display = 'block';
  if (connectedChannelName) {
    connectedChannelName.textContent = '/ ' + (channels[id] ? channels[id].name : 'Voz');
  }
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
    if (screenBtn) screenBtn.disabled = true;
    if (voiceStatusPanel) voiceStatusPanel.style.display = 'none';
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
  if (!usersList) return;
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

if (chatForm) {
  chatForm.onsubmit = (e) => {
    e.preventDefault();
    const text = chatInput ? chatInput.value.trim() : '';
    if (!text) return;
    socket.emit('chat-message', { channelId: currentTextChannel, text });
    addMessage(myName, text);
    if (chatInput) chatInput.value = '';
  };
}

function addMessage(name, text) {
  if (!messagesDiv) return;
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
  renderChannels();
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

if (screenBtn) {
  screenBtn.onclick = async () => {
    if (!currentVoiceChannel) return;

    if (sharingScreen) {
      stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('Compartilhamento de tela indisponível no navegador atual (exige HTTPS ou localhost).');
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
}

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
  if (screenBtn) screenBtn.textContent = '🖥️';
}

function addScreenTile(id, stream, isLocal) {
  if (!screenGrid) return;
  let tile = document.getElementById('screen-' + id);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'screen-tile';
    tile.id = 'screen-' + id;
    tile.style.position = 'relative';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    tile.appendChild(video);

    const label = document.createElement('div');
    label.className = 'screen-label';
    label.textContent = isLocal ? 'Você (Compartilhando)' : (remoteUsers[id] || 'Alguém');
    tile.appendChild(label);

    const fsBtn = document.createElement('button');
    fsBtn.textContent = '⛶ Tela Cheia';
    fsBtn.style.position = 'absolute';
    fsBtn.style.top = '10px';
    fsBtn.style.right = '10px';
    fsBtn.style.backgroundColor = 'rgba(0,0,0,0.7)';
    fsBtn.style.color = '#fff';
    fsBtn.style.border = 'none';
    fsBtn.style.padding = '5px 10px';
    fsBtn.style.borderRadius = '4px';
    fsBtn.style.cursor = 'pointer';
    fsBtn.style.zIndex = '10';

    fsBtn.onclick = () => {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
      } else if (video.msRequestFullscreen) {
        video.msRequestFullscreen();
      }
    };

    tile.appendChild(fsBtn);
    screenGrid.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}

function removeScreenTile(id) {
  const tile = document.getElementById('screen-' + id);
  if (tile) tile.remove();
}
