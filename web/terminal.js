(function() {
  const dom = {
    connectBtn: document.getElementById('termConnectBtn'),
    disconnectBtn: document.getElementById('termDisconnectBtn'),
    speakerSelect: document.getElementById('termSpeakerSelect'),
    volume: document.getElementById('termVolume'),
    mute: document.getElementById('termSpeakerMute'),
    tgInput: document.getElementById('termTgInput'),
    connStatus: document.getElementById('termConnStatus'),
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
      if (typeof audioCtx.setSinkId === 'function' && dom.speakerSelect.value) {
          audioCtx.setSinkId(dom.speakerSelect.value).catch(console.error);
      }

      // Setup WebSocket
      const wsUrl = `ws://${window.location.hostname}:8081/`;
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        isConnected = true;
        dom.connStatus.textContent = "CONNECTED";
        dom.connectBtn.hidden = true;
        dom.disconnectBtn.hidden = false;
        document.getElementById('termPttBtn').hidden = false;
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
      
      // Safe volume boost (1.5x) to ensure audibility without severe clipping
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 1.5;
      
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination); 
      
      // Gapless playback scheduling with minimal 30ms jitter buffer
      if (nextAudioTime < audioCtx.currentTime) {
          nextAudioTime = audioCtx.currentTime + 0.03; // 30ms buffer if underrun
      }
      
      source.start(nextAudioTime);
      nextAudioTime += buffer.duration;
  }

  function disconnectAudio() {
    isConnected = false;
    stopTransmitting();
    dom.connStatus.textContent = "DISCONNECTED";
    dom.connectBtn.hidden = false;
    dom.disconnectBtn.hidden = true;
    document.getElementById('termPttBtn').hidden = true;

    if (ws) {
      ws.close();
      ws = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  }

  let micStream = null;
  let micSource = null;
  let scriptNode = null;

  async function startTransmitting() {
      if (!isConnected || isTransmitting) return;
      try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!audioCtx) return;
          
          const callType = document.getElementById('termPrivateCall').checked ? "private" : "group";
          ws.send(JSON.stringify({ type: "tx_start", tg: dom.tgInput.value, call_type: callType }));
          
          micSource = audioCtx.createMediaStreamSource(micStream);
          scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
          
          scriptNode.onaudioprocess = (e) => {
              if (!isTransmitting) return;
              const inputData = e.inputBuffer.getChannelData(0);
              // Send Float32Array directly over WebSocket
              if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(inputData.buffer);
              }
          };
          
          micSource.connect(scriptNode);
          scriptNode.connect(audioCtx.destination);
          
          isTransmitting = true;
          document.getElementById('termPttBtn').style.backgroundColor = "red";
          document.getElementById('termPttBtn').style.color = "white";
          document.getElementById('termPttStatus').textContent = "TX ACTIVE";
          
      } catch (err) {
          console.error("Mic error:", err);
          alert("Microphone access denied.");
      }
  }

  function stopTransmitting() {
      if (!isTransmitting) return;
      isTransmitting = false;
      
      const pttBtn = document.getElementById('termPttBtn');
      if (pttBtn) {
          pttBtn.style.backgroundColor = "";
          pttBtn.style.color = "";
      }
      
      const statusEl = document.getElementById('termPttStatus');
      if (statusEl) statusEl.textContent = "RX ONLY";
      
      if (scriptNode) {
          scriptNode.disconnect();
          scriptNode = null;
      }
      if (micSource) {
          micSource.disconnect();
          micSource = null;
      }
      if (micStream) {
          micStream.getTracks().forEach(t => t.stop());
          micStream = null;
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "tx_stop" }));
      }
  }

  function sendControlState() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "control",
        tg: dom.tgInput.value
      }));
    }
  }

  function testAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 });
      nextAudioTime = audioCtx.currentTime;
      if (typeof audioCtx.setSinkId === 'function' && dom.speakerSelect.value) {
          audioCtx.setSinkId(dom.speakerSelect.value).catch(console.error);
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    // Create a 1-second 440Hz sine wave buffer at 8000Hz
    const sampleRate = 8000;
    const duration = 1.0;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const floatArr = buffer.getChannelData(0);
    
    for (let i = 0; i < floatArr.length; i++) {
        // Sine wave formula: Math.sin(2 * PI * freq * time)
        // fade in/out to avoid clicks
        let env = 1.0;
        if (i < 400) env = i / 400;
        else if (i > floatArr.length - 400) env = (floatArr.length - i) / 400;
        floatArr[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * env * 0.5;
    }
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(audioCtx.currentTime);
  }

  // Events
  dom.connectBtn.addEventListener('click', connectAudio);
  dom.disconnectBtn.addEventListener('click', disconnectAudio);
  document.getElementById('termTestAudioBtn').addEventListener('click', testAudio);
  
  const pttBtn = document.getElementById('termPttBtn');
  if (pttBtn) {
      pttBtn.addEventListener('mousedown', startTransmitting);
      pttBtn.addEventListener('mouseup', stopTransmitting);
      pttBtn.addEventListener('mouseleave', stopTransmitting);
      pttBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startTransmitting(); });
      pttBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopTransmitting(); });
  }

  dom.volume.addEventListener('input', (e) => {
    // We could add a gain node if we wanted
    console.log("Volume set to", e.target.value);
  });
  dom.speakerSelect.addEventListener('change', async (e) => {
    if (audioCtx && typeof audioCtx.setSinkId === 'function') {
      try {
        await audioCtx.setSinkId(e.target.value);
        console.log("Audio device updated to", e.target.value);
      } catch (err) {
        console.error("Could not set audio device:", err);
      }
    }
  });

  // Init
  populateDevices();

})();
