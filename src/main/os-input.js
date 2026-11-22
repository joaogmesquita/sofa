// Entrada no nível do Windows (mouse, volume) via user32, sem dependências pesadas.
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const keybd_event = user32.func(
  'void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)'
);
const mouse_event = user32.func(
  'void __stdcall mouse_event(uint32 dwFlags, int32 dx, int32 dy, int32 dwData, uintptr dwExtraInfo)'
);

const KEYUP = 0x0002;
const VK = { volup: 0xaf, voldown: 0xae, mute: 0xad, mediaplay: 0xb3 };
const M = { MOVE: 0x1, LDOWN: 0x2, LUP: 0x4, RDOWN: 0x8, RUP: 0x10, WHEEL: 0x800 };

function tap(vk) {
  keybd_event(vk, 0, 0, 0);
  keybd_event(vk, 0, KEYUP, 0);
}

module.exports = {
  volume(dir) {
    tap(VK[dir]);
  },
  move(dx, dy) {
    mouse_event(M.MOVE, Math.round(dx), Math.round(dy), 0, 0);
  },
  click(button = 'left') {
    if (button === 'right') {
      mouse_event(M.RDOWN, 0, 0, 0, 0);
      mouse_event(M.RUP, 0, 0, 0, 0);
    } else {
      mouse_event(M.LDOWN, 0, 0, 0, 0);
      mouse_event(M.LUP, 0, 0, 0, 0);
    }
  },
  scroll(amount) {
    mouse_event(M.WHEEL, 0, 0, Math.round(amount), 0);
  }
};
