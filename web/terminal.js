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
  let micStream = null;
  let micNode = null;
  let scriptProcessor = null;
  let gainNode = null;
  let speakerNode = null; // To route incoming audio to specific speaker

  let isConnected = false;
  let isTransmitting = false;

  async function populateDevices() {
    try {
      // Prompt for permission first so devices have labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const mics = devices.filter(d => d.kind === 'audioinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');

      if (mics.length > 0) {
        dom.micSelect.innerHTML = '';
        mics.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Microphone ${dom.micSelect.length + 1}`;
          dom.micSelect.appendChild(opt);
        });
      }

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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser is blocking microphone access because this dashboard is running on HTTP instead of HTTPS. \n\nTo fix this in Chrome/Edge, go to: chrome://flags/#unsafely-treat-insecure-origin-as-secure \nEnable the flag and add: http://" + window.location.host);
      }

      const constraints = {
        audio: {
          deviceId: dom.micSelect.value !== 'default' ? { exact: dom.micSelect.value } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };
      
      micStream = await navigator.mediaDevices.getUserMedia(constraints);
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 });
      
      // Microphone path
      micNode = audioCtx.createMediaStreamSource(micStream);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = dom.micGain.value / 100;
      
      // We use ScriptProcessor for raw PCM access (deprecated but widely supported and simple for 8khz mono)
      scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (e) => {
        if (!isTransmitting || !ws || ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to 16-bit PCM for the backend
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        ws.send(pcm16.buffer);
      };

      micNode.connect(gainNode);
      gainNode.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination); // Required to keep it running

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
      // Decode incoming 16-bit PCM and play it
      // For simplicity in this skeleton, we'll assume the backend sends properly formatted chunks
      // This will be expanded when we build the bridge.
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
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
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
  
  dom.pttBtn.addEventListener('mousedown', () => { if(isConnected) { isTransmitting = true; sendControlState(); updatePttUI(); } });
  dom.pttBtn.addEventListener('mouseup', () => { if(isConnected) { isTransmitting = false; sendControlState(); updatePttUI(); } });
  dom.pttBtn.addEventListener('mouseleave', () => { if(isTransmitting) { isTransmitting = false; sendControlState(); updatePttUI(); } });
  
  dom.micGain.addEventListener('input', (e) => {
    if (gainNode) gainNode.gain.value = e.target.value / 100;
  });

  // Init
  populateDevices();

})();
