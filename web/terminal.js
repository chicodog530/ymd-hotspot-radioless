(function() {
  const dom = {
    connectBtn: document.getElementById('termConnectBtn'),
    disconnectBtn: document.getElementById('termDisconnectBtn'),
    pttBtn: document.getElementById('termPttBtn'),
    micSelect: document.getElementById('termMicSelect'),
    speakerSelect: document.getElementById('termSpeakerSelect'),
    volume: document.getElementById('termVolume'),
    mute: document.getElementById('termSpeakerMute'),
    micGain: document.getElementById('termMicGain'),
    tgInput: document.getElementById('termTgInput'),
    connStatus: document.getElementById('termConnStatus'),
    pttStatus: document.getElementById('termPttStatus'),
    signalViz: document.getElementById('termSignalViz'),
    activityBadge: document.getElementById('termActivityBadge'),
    activityWho: document.getElementById('termActivityWho'),
    activityDest: document.getElementById('termActivityDest')
  };

  if (!dom.connectBtn) return; // Terminal tab not present

  let ws = null;
  let audioCtx = null;
  let nextAudioTime = 0;
  let speakerNode = null; // To route incoming audio to specific speaker

  let isConnected = false;
  let isTransmitting = false;

  async function populateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const speakers = devices.filter(d => d.kind === 'audiooutput');

      if (speakers.length > 0) {
        dom.speakerSelect.innerHTML = '';
        speakers.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Speaker ${dom.speakerSelect.length + 1}`;
          dom.speakerSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn("Could not enumerate audio devices:", err);
    }
  }

  async function connectAudio() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 });
      nextAudioTime = audioCtx.currentTime;

      // Setup WebSocket
      const wsUrl = `ws://${window.location.hostname}:8081/`;
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        isConnected = true;
        dom.connStatus.textContent = "CONNECTED";
        dom.connectBtn.hidden = true;
        dom.disconnectBtn.hidden = false;
        dom.pttBtn.disabled = false;
        sendControlState();
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);
          if (msg.type === "rx_start") {
             dom.activityWho.textContent = msg.callsign || "Unknown";
             dom.activityDest.textContent = msg.tg || "TG";
             dom.signalViz.classList.remove('idle');
             dom.signalViz.classList.add('active');
             dom.activityBadge.classList.remove('idle');
             dom.activityBadge.classList.add('active');
          } else if (msg.type === "rx_stop") {
             dom.activityWho.textContent = "Waiting for traffic";
             dom.activityDest.textContent = "";
             dom.signalViz.classList.add('idle');
             dom.signalViz.classList.remove('active');
             dom.activityBadge.classList.add('idle');
             dom.activityBadge.classList.remove('active');
          }
        } else if (event.data instanceof ArrayBuffer) {
           if (dom.mute.checked) return;
           playAudio(event.data);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        alert("Could not connect to the backend audio bridge. Is the service running?");
      };

      ws.onclose = () => {
        disconnectAudio();
      };
      
    } catch (err) {
      console.error("Audio connection failed:", err);
      alert("Could not connect audio: " + err.message);
    }
  }
  
  function playAudio(pcmData) {
      if (!audioCtx) return;
      
      const floatArr = new Float32Array(pcmData);
      const buffer = audioCtx.createBuffer(1, floatArr.length, 8000);
      buffer.copyToChannel(floatArr, 0);
      
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination); 
      
      // Gapless playback scheduling
      if (nextAudioTime < audioCtx.currentTime) {
          nextAudioTime = audioCtx.currentTime + 0.1; // Add small buffer if underrun
      }
      
      source.start(nextAudioTime);
      nextAudioTime += buffer.duration;
  }

  function disconnectAudio() {
    isConnected = false;
    isTransmitting = false;
    dom.connStatus.textContent = "DISCONNECTED";
    dom.connectBtn.hidden = false;
    dom.disconnectBtn.hidden = true;
    dom.pttBtn.disabled = true;
    updatePttUI();

    if (ws) {
      ws.close();
      ws = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  }

  function sendControlState() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "control",
        tg: dom.tgInput.value,
        ptt: isTransmitting
      }));
    }
  }

  function updatePttUI() {
    if (isTransmitting) {
      dom.pttBtn.classList.add('danger');
      dom.pttBtn.classList.remove('primary');
      dom.pttBtn.textContent = "TRANSMITTING...";
      dom.pttStatus.textContent = "TX";
      dom.activityBadge.classList.remove('idle');
      dom.activityBadge.classList.add('active', 'tx');
      dom.signalViz.classList.remove('idle');
      dom.signalViz.classList.add('active', 'tx');
    } else {
      dom.pttBtn.classList.remove('danger');
      dom.pttBtn.classList.add('primary');
      dom.pttBtn.textContent = "PUSH TO TALK";
      dom.pttStatus.textContent = "IDLE";
      dom.activityBadge.classList.add('idle');
      dom.activityBadge.classList.remove('active', 'tx');
      dom.signalViz.classList.add('idle');
      dom.signalViz.classList.remove('active', 'tx');
    }
  }

  // Events
  dom.connectBtn.addEventListener('click', connectAudio);
  dom.disconnectBtn.addEventListener('click', disconnectAudio);
  
  // Remove PTT button logic
  dom.pttBtn.addEventListener('click', () => { alert('PTT is disabled in Listen-Only mode.'); });

  // Init
  populateDevices();

})();
