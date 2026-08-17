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
      // Clique no elemento inteiro do canal de voz
      li.onclick = (e) => {
        // Evita desconectar/conectar ao mexer na barra de volume
        if (e.target.tagName === 'INPUT') return;
        toggleVoiceChannel(id);
      };

      const titleSpan = document.createElement('div');
      titleSpan.style.cursor = 'pointer';
      titleSpan.textContent = '🔊 ' + c.name;
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

async function joinVoiceChannel(id) {
  if (currentVoiceChannel === id) return;
  if (currentVoiceChannel) leaveVoiceChannel(false);

  // Verifica se o navegador permite mediaDevices (Exige HTTPS ou localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('O seu navegador bloqueou o microfone/tela. Para testar com amigos em IP externo/local, use HTTPS ou abra pelo localhost.');
    return;
  }

  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Permissão de microfone negada ou dispositivo não encontrado.');
    return;
  }

  getAudioCtx();
  currentVoiceChannel = id;

  if (!voiceMembershipMap[id]) {
    voiceMembershipMap[id] = [];
  }
  if (!voiceMembershipMap[id].some(m => m.id === socket.id)) {
    voiceMembershipMap[id].push({ id: socket.id, name: myName });
  }

  socket.emit('join-voice-channel', id);
  
  screenBtn.disabled = false;
  voiceStatusPanel.style.display = 'block';
  connectedChannelName.textContent = '/ ' + (channels[id] ? channels[id].name : 'Voz');
  renderChannels();
}
