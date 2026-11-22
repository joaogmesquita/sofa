// Gera build/icon.png (512x512) a partir de src/remote/icon.svg, num Edge headless.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'src', 'remote', 'icon.svg'), 'utf8');
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-icon-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--remote-debugging-port=9557', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  await wait(2500);
  try {
    const t = await CDP.New({ port: 9557, url: 'about:blank' });
    const c = await CDP({ port: 9557, target: t.id });
    await c.Emulation.setDeviceMetricsOverride({ width: 512, height: 512, deviceScaleFactor: 1, mobile: false });
    await c.Emulation.setDefaultBackgroundColorOverride({ color: { r: 0, g: 0, b: 0, a: 0 } });
    await c.Page.enable();
    const { frameId } = await c.Page.getFrameTree().then((r) => ({ frameId: r.frameTree.frame.id }));
    await c.Page.setDocumentContent({ frameId, html });
    await wait(500);
    const { data } = await c.Page.captureScreenshot({ format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'icon.png'), Buffer.from(data, 'base64'));
    console.log('build/icon.png ok');
  } finally {
    edge.kill();
    process.exit(0);
  }
})();
