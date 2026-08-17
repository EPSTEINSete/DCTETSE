// Função para renegociar WebRTC ao ligar/desligar o compartilhamento
async function renegotiate(peerId) {
  const pc = peers[peerId];
  if (!pc) return;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: peerId, data: { sdp: pc.localDescription } });
  } catch (err) {}
}

// Compartilhamento de Tela atualizado com renegociação
screenBtn.onclick = async () => {
  if (!currentVoiceChannel) return;

  if (sharingScreen) {
    stopScreenShare();
    return;
  }

  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    
    // Adiciona a faixa de vídeo e avisa todos os peers conectados
    Object.entries(peers).forEach(([peerId, pc]) => {
      localScreenStream.getTracks().forEach(t => pc.addTrack(t, localScreenStream));
      renegotiate(peerId);
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

  Object.entries(peers).forEach(([peerId, pc]) => {
    pc.getSenders().forEach(s => {
      if (s.track && s.track.kind === 'video') pc.removeTrack(s);
    });
    renegotiate(peerId);
  });

  removeScreenTile('me');
  localScreenStream = null;
  sharingScreen = false;
  screenBtn.textContent = '🖥️';
}

// Adiciona evento de clique para entrar em tela cheia (Fullscreen)
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

    // Clique na transmissão para expandir em Tela Cheia
    tile.onclick = () => {
      if (!document.fullscreenElement) {
        tile.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

    screenGrid.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}
