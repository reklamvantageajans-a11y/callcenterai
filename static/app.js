// ═══════════════════════════════════════════════════
//  Voice Call Client — Minimal, Fast, Low-Latency
// ═══════════════════════════════════════════════════
let ws = null;
let audioCtx = null;
let mediaStream = null;
let processor = null;
let isMuted = false;
let isActive = false;
let nextPlayTime = 0;
let activeSources = [];
let currentBubble = null;
let pingTimer = null;

const orb = document.getElementById('orb');
const orbLabel = document.getElementById('orb-label');
const statusText = document.getElementById('status-text');
const connDot = document.getElementById('conn-dot');
const transcript = document.getElementById('transcript');
const btnCall = document.getElementById('btn-call');
const btnMute = document.getElementById('btn-mute');
const pingEl = document.getElementById('ping');

// ── STATE ──
function setState(state, label) {
  orb.className = state;
  orbLabel.textContent = label || '';
  statusText.textContent = label || '';
  statusText.className = '';
  if (state === 'listening') statusText.classList.add('active');
  else if (state === 'speaking') statusText.classList.add('speaking');
  else if (state === 'thinking') statusText.classList.add('thinking');
}

// ── CALL TOGGLE ──
async function toggleCall() {
  if (isActive) {
    endCall();
  } else {
    await startCall();
  }
}

async function startCall() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (e) {
    alert('Mikrofon izni gerekli!');
    return;
  }

  isActive = true;
  btnCall.classList.add('active');
  btnMute.style.display = 'flex';
  setState('', 'Bağlanıyor...');

  // WebSocket
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/voice`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    setState('listening', 'Bağlandı');
    startMic();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ event: 'ping', ts: Date.now() }));
      }
    }, 5000);
  };

  ws.onclose = () => {
    if (isActive) endCall();
  };

  ws.onerror = () => {
    if (isActive) endCall();
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    switch (msg.event) {
      case 'audio':
        playChunk(msg.data);
        setState('speaking', 'Konuşuyor');
        break;
      case 'text':
        appendAI(msg.delta);
        break;
      case 'done':
        setState('listening', 'Dinliyor');
        currentBubble = null;
        break;
      case 'speech_start':
        flushAudio();
        setState('listening', 'Dinliyor');
        currentBubble = null;
        break;
      case 'speech_stop':
        setState('thinking', 'Düşünüyor');
        break;
      case 'interrupted':
        flushAudio();
        setState('listening', 'Dinliyor');
        currentBubble = null;
        break;
      case 'pong':
        if (msg.ts) {
          pingEl.textContent = (Date.now() - msg.ts) + 'ms';
        }
        break;
      case 'error':
        console.error('Server error:', msg.message);
        break;
    }
  };
}

function endCall() {
  isActive = false;
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (ws) { ws.close(); ws = null; }
  stopMic();
  flushAudio();
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  btnCall.classList.remove('active');
  btnMute.style.display = 'none';
  isMuted = false;
  btnMute.classList.remove('muted');
  setState('', 'Başlamak için dokunun');
  connDot.style.background = '#6b6b80';
  connDot.style.boxShadow = 'none';
  currentBubble = null;
}

// ── MICROPHONE ──
function startMic() {
  if (!audioCtx || !mediaStream) return;
  const source = audioCtx.createMediaStreamSource(mediaStream);
  processor = audioCtx.createScriptProcessor(2048, 1, 1);

  processor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== 1 || isMuted) return;
    const float32 = e.inputBuffer.getChannelData(0);
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    ws.send(pcm16.buffer);
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);
  connDot.style.background = '#00d4aa';
  connDot.style.boxShadow = '0 0 8px #00d4aa';
}

function stopMic() {
  if (processor) { processor.disconnect(); processor = null; }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

// ── MUTE ──
function toggleMute() {
  isMuted = !isMuted;
  btnMute.classList.toggle('muted', isMuted);
}

// ── AUDIO PLAYBACK (gapless queue) ──
function playChunk(b64) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  try {
    const raw = atob(b64);
    const pcm16 = new Int16Array(raw.length / 2);
    for (let i = 0; i < pcm16.length; i++) {
      const lsb = raw.charCodeAt(i * 2);
      const msb = raw.charCodeAt(i * 2 + 1);
      let val = (msb << 8) | lsb;
      if (val >= 0x8000) val -= 0x10000;
      pcm16[i] = val;
    }
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const buf = audioCtx.createBuffer(1, float32.length, 24000);
    buf.getChannelData(0).set(float32);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    const startAt = Math.max(now, nextPlayTime);
    src.start(startAt);
    nextPlayTime = startAt + buf.duration;

    activeSources.push(src);
    src.onended = () => {
      const idx = activeSources.indexOf(src);
      if (idx !== -1) activeSources.splice(idx, 1);
    };
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}

function flushAudio() {
  activeSources.forEach(s => {
    try { s.stop(); } catch {}
  });
  activeSources = [];
  nextPlayTime = 0;
}

// ── TRANSCRIPT ──
function appendAI(text) {
  if (!currentBubble) {
    currentBubble = document.createElement('div');
    currentBubble.className = 'msg ai';
    transcript.appendChild(currentBubble);
  }
  currentBubble.textContent += text;
  transcript.scrollTop = transcript.scrollHeight;
}
