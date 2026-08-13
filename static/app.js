// ═══════════════════════════════════════════════════
//  Voice Call Client — Minimal, Fast, Low-Latency
// ═══════════════════════════════════════════════════
let ws = null;
let audioCtx = null;
let mediaStream = null;
let micNode = null;
let micSource = null;
let isMuted = false;
let isActive = false;
let nextPlayTime = 0;
let playbackStart = null;   // ctx time when current response playback begins
let activeSources = [];
let currentBubble = null;
let pingTimer = null;
let selectedLang = 'de';

// Small jitter buffer: delay the first chunk of each response slightly so
// network hiccups don't cause clicks/gaps mid-sentence.
const JITTER_BUFFER = 0.12;

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

// ── LANGUAGE PICKER ──
function setLang(lang) {
  if (isActive) return; // don't switch mid-call
  selectedLang = lang;
  document.getElementById('btn-de').classList.toggle('active', lang === 'de');
  document.getElementById('btn-tr').classList.toggle('active', lang === 'tr');
  const label = lang === 'tr' ? 'Başlamak için dokunun' : 'Zum Starten tippen';
  orbLabel.textContent = label;
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
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  try {
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
  document.getElementById('lang-picker').style.display = 'none';
  setState('', selectedLang === 'tr' ? 'Bağlanıyor...' : 'Verbinde...');

  // WebSocket
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/voice?lang=${selectedLang}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = async () => {
    setState('listening', 'Bağlandı');
    await startMic();

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
        playbackStart = null;
        nextPlayTime = 0;
        break;
      case 'speech_start':
        reportInterrupt();
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
  document.getElementById('lang-picker').style.display = 'flex';
  isMuted = false;
  btnMute.classList.remove('muted');
  setState('', selectedLang === 'tr' ? 'Aramak için dokun' : 'Zum Starten tippen');
  connDot.style.background = '#6b6b80';
  connDot.style.boxShadow = 'none';
  currentBubble = null;
}

// ── MICROPHONE (AudioWorklet — off main thread, low latency) ──
async function startMic() {
  if (!audioCtx || !mediaStream) return;
  try {
    await audioCtx.audioWorklet.addModule('/static/pcm-worklet.js');
  } catch (e) {
    console.error('Worklet load failed:', e);
    return;
  }
  micSource = audioCtx.createMediaStreamSource(mediaStream);
  micNode = new AudioWorkletNode(audioCtx, 'pcm-processor');

  micNode.port.onmessage = (e) => {
    if (!ws || ws.readyState !== 1 || isMuted) return;
    ws.send(e.data);
  };

  micSource.connect(micNode);
  // Worklet has no audible output; connect to keep the graph pulling audio.
  micNode.connect(audioCtx.destination);
  connDot.style.background = '#00d4aa';
  connDot.style.boxShadow = '0 0 8px #00d4aa';
}

function stopMic() {
  if (micNode) { try { micNode.port.onmessage = null; micNode.disconnect(); } catch {} micNode = null; }
  if (micSource) { try { micSource.disconnect(); } catch {} micSource = null; }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

// Tell the server how much of the assistant's audio was actually heard, so it
// can truncate the rest and keep the conversation coherent after a barge-in.
function reportInterrupt() {
  if (!audioCtx || playbackStart === null) return;
  let playedMs = (audioCtx.currentTime - playbackStart) * 1000;
  const totalMs = (nextPlayTime - playbackStart) * 1000;
  if (playedMs < 0) playedMs = 0;
  if (playedMs > totalMs) playedMs = totalMs;
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ event: 'interrupt', ms: Math.round(playedMs) }));
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
    let sumSquares = 0;
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
      sumSquares += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sumSquares / float32.length);

    if (orb) {
      orb.style.setProperty('--orb-scale', 1 + (rms * 3.5));
      setTimeout(() => {
        if (orb) orb.style.setProperty('--orb-scale', 1);
      }, 150);
    }

    const buf = audioCtx.createBuffer(1, float32.length, 24000);
    buf.getChannelData(0).set(float32);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    let startAt;
    if (playbackStart === null || nextPlayTime <= now) {
      // First chunk of a fresh response: add a small jitter buffer.
      startAt = now + JITTER_BUFFER;
      playbackStart = startAt;
    } else {
      startAt = nextPlayTime;
    }
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
  playbackStart = null;
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
