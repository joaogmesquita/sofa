// Volume do Windows via Core Audio (IAudioEndpointVolume), no dispositivo de saída padrão.
const koffi = require('koffi');

const ole32 = koffi.load('ole32.dll');
const GUID = koffi.struct('SOFA_GUID', { d1: 'uint32', d2: 'uint16', d3: 'uint16', d4: koffi.array('uint8', 8) });
const CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void *reserved, uint32 coinit)');
const CoCreateInstance = ole32.func('long __stdcall CoCreateInstance(SOFA_GUID *clsid, void *outer, uint32 ctx, SOFA_GUID *iid, _Out_ void **ppv)');

function guid(s) {
  const h = s.replace(/-/g, '');
  const b = [];
  for (let i = 16; i < 32; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
  return { d1: parseInt(h.slice(0, 8), 16), d2: parseInt(h.slice(8, 12), 16), d3: parseInt(h.slice(12, 16), 16), d4: b };
}

const CLSID_MMDeviceEnumerator = guid('BCDE0395-E52F-467C-8E3D-C4579291692E');
const IID_IMMDeviceEnumerator = guid('A95664D2-9614-4F35-A746-DE8DB63617E6');
const IID_IAudioEndpointVolume = guid('5CDF2C82-841E-4546-9722-0CF74078229A');
const CLSCTX_ALL = 0x17;

const P = {
  release: koffi.proto('uint32 __stdcall SofaRelease(void *self)'),
  getDefault: koffi.proto('long __stdcall SofaGetDefault(void *self, int flow, int role, _Out_ void **dev)'),
  activate: koffi.proto('long __stdcall SofaActivate(void *self, SOFA_GUID *iid, uint32 ctx, void *params, _Out_ void **out)'),
  setScalar: koffi.proto('long __stdcall SofaSetScalar(void *self, float level, void *ctx)'),
  getScalar: koffi.proto('long __stdcall SofaGetScalar(void *self, _Out_ float *level)'),
  setMute: koffi.proto('long __stdcall SofaSetMute(void *self, int mute, void *ctx)'),
  getMute: koffi.proto('long __stdcall SofaGetMute(void *self, _Out_ int *mute)')
};

function method(obj, index, proto) {
  const vtbl = koffi.decode(obj, 'void *');
  const fn = koffi.decode(vtbl, index * 8, 'void *');
  return (...args) => koffi.call(fn, proto, obj, ...args);
}

let initialized = false;
function withEndpoint(cb) {
  if (!initialized) { CoInitializeEx(null, 0); initialized = true; }
  const en = [null];
  if (CoCreateInstance(CLSID_MMDeviceEnumerator, null, CLSCTX_ALL, IID_IMMDeviceEnumerator, en) < 0) throw new Error('MMDeviceEnumerator');
  const dev = [null];
  const vol = [null];
  try {
    if (method(en[0], 4, P.getDefault)(0, 1, dev) < 0) throw new Error('sem saída de áudio padrão');
    if (method(dev[0], 3, P.activate)(IID_IAudioEndpointVolume, CLSCTX_ALL, null, vol) < 0) throw new Error('IAudioEndpointVolume');
    return cb(vol[0]);
  } finally {
    if (vol[0]) method(vol[0], 2, P.release)();
    if (dev[0]) method(dev[0], 2, P.release)();
    method(en[0], 2, P.release)();
  }
}

function get() {
  return withEndpoint((v) => {
    const level = [0];
    const mute = [0];
    method(v, 9, P.getScalar)(level);
    method(v, 15, P.getMute)(mute);
    return { level: Math.round(level[0] * 100), muted: !!mute[0] };
  });
}

function set(percent) {
  const p = Math.max(0, Math.min(100, percent));
  withEndpoint((v) => {
    method(v, 7, P.setScalar)(p / 100, null);
    if (p > 0) method(v, 14, P.setMute)(0, null);
  });
  return get();
}

function change(delta) {
  return set(get().level + delta);
}

function toggleMute() {
  withEndpoint((v) => {
    const mute = [0];
    method(v, 15, P.getMute)(mute);
    method(v, 14, P.setMute)(mute[0] ? 0 : 1, null);
  });
  return get();
}

module.exports = { get, set, change, toggleMute };
