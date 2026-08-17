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
  dom.volumeInput.addEventListener('input', (e) => {
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
