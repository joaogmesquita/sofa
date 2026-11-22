// Grava o comando de voz (16 kHz mono), detecta fim da fala e manda o WAV ao processo principal.
const pill = document.getElementById('pill');
const stateEl = document.getElementById('state');
const mainEl = document.getElementById('main');
const bars = [...document.querySelectorAll('#bars i')];

const RATE = 16000;
const SPEECH_RMS = 0.018;   // acima disso conta como fala
const END_SILENCE = 1100;   // ms de silêncio depois da fala encerra
const NO_SPEECH = 5000;     // ms sem nenhuma fala cancela
const MAX_LEN = 9000;       // ms máximos de gravação

let rec = null;

function show(state, text, cls = '') {
  pill.className = 'pill show ' + cls;
  stateEl.textContent = state;
  mainEl.textContent = text;
}

async function pickMic() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  // o microfone do DualSense (só disponível com o controle no cabo USB)
  const ds = devs.find((d) => /dualsense|wireless controller/i.test(d.label));
  return ds ? { deviceId: { exact: ds.deviceId }, label: 'microfone do controle' } : { label: 'microfone do PC' };
}

async function start() {
  if (rec) return;
  show('Ouvindo…', 'Fale um comando');
  try {
    const mic = await pickMic();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: mic.deviceId, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    stateEl.textContent = `Ouvindo pelo ${mic.label}…`;
    const ctx = new AudioContext({ sampleRate: RATE });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    rec = { stream, ctx, src, proc, chunks: [], started: Date.now(), speech: false, lastVoice: 0 };
    proc.onaudioprocess = (e) => {
      if (!rec) return;
      const d = e.inputBuffer.getChannelData(0);
      rec.chunks.push(new Float32Array(d));
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / d.length);
      const now = Date.now();
      bars.forEach((b, i) => (b.style.height = 6 + Math.min(24, rms * 600 * (0.6 + Math.abs(Math.sin(now / 90 + i)))) + 'px'));
      if (rms > SPEECH_RMS) { rec.speech = true; rec.lastVoice = now; }
      if (rec.speech && now - rec.lastVoice > END_SILENCE) finish();
      else if (!rec.speech && now - rec.started > NO_SPEECH) cancel('Não ouvi nada');
      else if (now - rec.started > MAX_LEN) finish();
    };
    src.connect(proc);
    proc.connect(ctx.destination);
  } catch (e) {
    rec = null;
    show('Microfone', 'Nenhum microfone disponível', 'error');
    window.voice.cancelled('sem microfone');
  }
}

function teardown() {
  const r = rec;
  rec = null;
  if (!r) return null;
  r.proc.disconnect();
  r.src.disconnect();
  r.stream.getTracks().forEach((t) => t.stop());
  r.ctx.close();
  bars.forEach((b) => (b.style.height = '6px'));
  return r;
}

function cancel(msg) {
  teardown();
  show('Voz', msg, 'error');
  window.voice.cancelled(msg);
}

function finish() {
  const r = teardown();
  if (!r) return;
  if (!r.speech) return cancel('Não ouvi nada');
  show('Entendendo…', '…', 'thinking');
  window.voice.sendAudio(encodeWav(r.chunks));
}

function encodeWav(chunks) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, len * 2, true);
  let o = 44;
  for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true);
  return buf;
}

window.voice.onStart(start);
window.voice.onStop(finish);
window.voice.onShow(({ state, text, cls }) => show(state, text, cls));
window.voice.onHide(() => (pill.className = 'pill'));

// barra de volume (gatilhos, touchpad, celular ou voz)
const vol = document.getElementById('vol');
window.voice.onVol(({ level, muted }) => {
  pill.className = 'pill'; // a barra de volume substitui a de voz enquanto aparece
  vol.className = 'pill vol show' + (muted ? ' muted' : '');
  document.getElementById('vol-fill').style.width = (muted ? 0 : level) + '%';
  document.getElementById('vol-num').textContent = muted ? '–' : level;
  document.getElementById('vol-ico').textContent = muted || level === 0 ? '🔇' : level < 35 ? '🔈' : level < 70 ? '🔉' : '🔊';
});
window.voice.onHide(() => (vol.className = 'pill vol'));
