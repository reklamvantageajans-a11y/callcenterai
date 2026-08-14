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

const waveCanvas = document.getElementById('wave');
const waveLabel = document.getElementById('wave-label');
const statusText = document.getElementById('status-text');
const connDot = document.getElementById('conn-dot');
const transcript = document.getElementById('transcript');
const btnCall = document.getElementById('btn-call');
const btnMute = document.getElementById('btn-mute');
const pingEl = document.getElementById('ping');

const WAVE_BARS = 52;
const waveLevels = new Float32Array(WAVE_BARS);
let waveTarget = 0;
let waveMode = 'idle';

function pushWaveLevel(rms) {
  waveTarget = Math.min(1, rms * 3.8);
}

function startWaveLoop() {
  const ctx = waveCanvas.getContext('2d');
  function draw() {
    requestAnimationFrame(draw);
    const idle = waveMode === 'idle' ? 0.07
      : waveMode === 'thinking' ? 0.14
      : 0.05;
    const jitter = (Math.random() - 0.5) * idle * 0.5;
    const next = Math.min(1, waveTarget * 0.85 + idle + jitter);
    for (let i = 0; i < WAVE_BARS - 1; i++) waveLevels[i] = waveLevels[i + 1];
    waveLevels[WAVE_BARS - 1] = next;
    waveTarget *= 0.82;

    const dpr = window.devicePixelRatio || 1;
    const w = waveCanvas.clientWidth;
    const h = waveCanvas.clientHeight;
    if (waveCanvas.width !== Math.round(w * dpr) || waveCanvas.height !== Math.round(h * dpr)) {
      waveCanvas.width = Math.round(w * dpr);
      waveCanvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const slot = w / WAVE_BARS;
    const barW = Math.max(2, slot * 0.48);
    const mid = h / 2;
    const color = waveMode === 'speaking' ? '#1e3a5f'
      : waveMode === 'listening' ? '#334155'
      : waveMode === 'thinking' ? '#78716c'
      : '#94a3b8';
    ctx.fillStyle = color;

    for (let i = 0; i < WAVE_BARS; i++) {
      const amp = Math.max(0.05, waveLevels[i]);
      const bh = amp * (h * 0.88);
      const x = i * slot + (slot - barW) / 2;
      const y = mid - bh / 2;
      const r = Math.min(barW / 2, 2);
      ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, barW, bh, r);
    } else {
      ctx.rect(x, y, barW, bh);
    }
    ctx.fill();
    }
  }
  draw();
}
startWaveLoop();

// ── STATE ──
function setState(state, label) {
  waveMode = state || 'idle';
  waveLabel.textContent = label || '';
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
  const label = lang === 'tr' ? 'Aramayı başlatın' : 'Anruf starten';
  waveLabel.textContent = label;
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
        alert('Bağlantı hatası: ' + msg.message);
        endCall();
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
  setState('', selectedLang === 'tr' ? 'Aramayı başlatın' : 'Anruf starten');
  connDot.style.background = '#94a3b8';
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
    const pcm = new Int16Array(e.data);
    let sum = 0;
    const step = 8;
    for (let i = 0; i < pcm.length; i += step) {
      const v = pcm[i] / 32768;
      sum += v * v;
    }
    pushWaveLevel(Math.sqrt(sum / Math.max(1, pcm.length / step)));
    ws.send(e.data);
  };

  micSource.connect(micNode);
  // Worklet has no audible output; connect to keep the graph pulling audio.
  micNode.connect(audioCtx.destination);
  connDot.style.background = '#15803d';
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

    pushWaveLevel(rms);

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
