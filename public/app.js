// --- CONTROLE DE VOLUME INDIVIDUAL E TELA CHEIA ---

// Quando um áudio remoto é recebido, criamos um elemento de áudio e um controle na UI se desejado
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

  // Atualiza o controle de volume do usuário se ele estiver visível na lista
  updateUserVolumeSlider(peerId);
}

// Ajustar o volume de um usuário específico
function setPeerVolume(peerId, volumeValue) {
  const audio = document.getElementById('audio-' + peerId);
  if (audio) {
    audio.volume = parseFloat(volumeValue);
  }
}

// Atualizar e renderizar a lista de membros do canal de voz com slider de volume
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
      const titleSpan = document.createElement('div');
      titleSpan.style.cursor = 'pointer';
      titleSpan.textContent = '🔊 ' + c.name;
      titleSpan.onclick = () => toggleVoiceChannel(id);
      li.appendChild(titleSpan);
      
      const members = voiceMembershipMap[id] || [];
      if (members.length > 0) {
        const memUl = document.createElement('ul');
        memUl.style.listStyle = 'none';
        memUl.style.paddingLeft = '15px';
        memUl.style.marginTop = '6px';
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

          // Adiciona o slider de volume para outros participantes (não para você mesmo)
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
            
            // Pega o volume atual do elemento de áudio
            const existingAudio = document.getElementById('audio-' + m.id);
            volSlider.value = existingAudio ? existingAudio.volume : 1;

            volSlider.style.width = '80px';
            volSlider.style.cursor = 'pointer';

            volSlider.oninput = (e) => {
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

function updateUserVolumeSlider(peerId) {
  renderChannels();
}

// --- TELA CHEIA (FULLSCREEN) NO COMPARTILHAMENTO DE TELA ---

function addScreenTile(id, stream, isLocal) {
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

    // Botão para Tela Cheia (Fullscreen)
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
      } else if (video.webkitRequestFullscreen) { /* Safari */
        video.webkitRequestFullscreen();
      } else if (video.msRequestFullscreen) { /* IE11 */
        video.msRequestFullscreen();
      }
    };

    tile.appendChild(fsBtn);
    screenGrid.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}
