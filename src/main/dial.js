// Receptor DIAL (o protocolo das smart TVs). Faz o PC aparecer no botão
// "Transmitir" do app do YouTube no celular. Quando o celular transmite, ele
// manda um pairingCode, e abrimos youtube.com/tv?pairingCode=... que pareia sozinho.
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const os = require('os');
const { EventEmitter } = require('events');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const ST = 'urn:dial-multiscreen-org:service:dial:1';

class Dial extends EventEmitter {
  constructor({ ip, port, name }) {
    super();
    this.ip = ip;
    this.port = port;
    this.name = name;
    // UUID estável por máquina, para o celular não ver um "aparelho novo" a cada abertura
    const h = crypto.createHash('md5').update('sofa-' + os.hostname()).digest('hex');
    this.uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    this.apps = { YouTube: { state: 'stopped' } };
  }

  get location() {
    return `http://${this.ip}:${this.port}/dd.xml`;
  }

  async start() {
    await this.startHttp();
    this.startSsdp();
  }

  deviceXml() {
    return `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:dial-multiscreen-org:device:dial:1</deviceType>
    <friendlyName>${this.name}</friendlyName>
    <manufacturer>Sofa</manufacturer>
    <modelName>Sofa PC Launcher</modelName>
    <UDN>uuid:${this.uuid}</UDN>
    <serviceList>
      <service>
        <serviceType>urn:dial-multiscreen-org:service:dial:1</serviceType>
        <serviceId>urn:dial-multiscreen-org:serviceId:dial</serviceId>
        <controlURL>/ssdp/notfound</controlURL>
        <eventSubURL>/ssdp/notfound</eventSubURL>
        <SCPDURL>/ssdp/notfound</SCPDURL>
      </service>
    </serviceList>
  </device>
</root>`;
  }

  appXml(name) {
    const app = this.apps[name];
    return `<?xml version="1.0" encoding="UTF-8"?>
<service xmlns="urn:dial-multiscreen-org:schemas:dial" dialVer="2.1">
  <name>${name}</name>
  <options allowStop="true"/>
  <state>${app.state}</state>${app.state === 'running' ? '\n  <link rel="run" href="run"/>' : ''}
</service>`;
  }

  setRunning(name, running) {
    if (this.apps[name]) this.apps[name].state = running ? 'running' : 'stopped';
  }

  startHttp() {
    this.http = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => this.route(req, res, body));
    });
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.port, '0.0.0.0', resolve);
    });
  }

  route(req, res, body) {
    const url = req.url.split('?')[0];
    const appUrl = `http://${this.ip}:${this.port}/apps/`;
    if (req.method === 'GET' && url === '/dd.xml') {
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Application-URL': appUrl, 'Access-Control-Expose-Headers': 'Application-URL' });
      return res.end(this.deviceXml());
    }
    const m = url.match(/^\/apps\/([^/]+)(\/run)?\/?$/);
    if (!m || !this.apps[m[1]]) return res.writeHead(404).end();
    const name = m[1];
    if (req.method === 'GET' && !m[2]) {
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      return res.end(this.appXml(name));
    }
    if (req.method === 'POST' && !m[2]) {
      this.emit('launch', name, body.trim());
      this.setRunning(name, true);
      res.writeHead(201, { Location: `${appUrl}${name}/run`, 'Content-Length': 0 });
      return res.end();
    }
    if (req.method === 'DELETE' && m[2]) {
      this.emit('stop', name);
      this.setRunning(name, false);
      return res.writeHead(200).end();
    }
    res.writeHead(405).end();
  }

  ssdpHeaders(st, usn) {
    return [
      'CACHE-CONTROL: max-age=1800',
      `LOCATION: ${this.location}`,
      'SERVER: Windows/10 UPnP/1.1 Sofa/0.1',
      `ST: ${st}`,
      `USN: ${usn}`,
      'BOOTID.UPNP.ORG: 1',
      'CONFIGID.UPNP.ORG: 1'
    ];
  }

  startSsdp() {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.ssdp = sock;
    sock.on('error', (e) => console.warn('[dial] SSDP:', e.message));
    sock.on('message', (msg, rinfo) => {
      const text = msg.toString();
      if (!text.startsWith('M-SEARCH')) return;
      const st = (text.match(/^ST:\s*(.+)$/im) || [])[1]?.trim();
      if (!st) return;
      const targets = st === 'ssdp:all' ? [ST, 'upnp:rootdevice'] : [ST, 'upnp:rootdevice', `uuid:${this.uuid}`].includes(st) ? [st] : [];
      for (const t of targets) {
        const usn = t.startsWith('uuid:') ? `uuid:${this.uuid}` : `uuid:${this.uuid}::${t}`;
        const reply = ['HTTP/1.1 200 OK', ...this.ssdpHeaders(t, usn), 'EXT:', `DATE: ${new Date().toUTCString()}`, '', ''].join('\r\n');
        sock.send(reply, rinfo.port, rinfo.address);
      }
    });
    sock.bind(SSDP_PORT, () => {
      try {
        sock.addMembership(SSDP_ADDR, this.ip);
        sock.setMulticastInterface(this.ip);
        sock.setMulticastTTL(4);
      } catch (e) {
        console.warn('[dial] multicast:', e.message);
      }
      this.notify('ssdp:alive');
      this.notifyTimer = setInterval(() => this.notify('ssdp:alive'), 30000);
    });
  }

  notify(nts) {
    for (const nt of ['upnp:rootdevice', ST]) {
      const msg = [
        'NOTIFY * HTTP/1.1',
        `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
        `NT: ${nt}`,
        `NTS: ${nts}`,
        ...this.ssdpHeaders(nt, `uuid:${this.uuid}::${nt}`).filter((l) => !l.startsWith('ST:')),
        '',
        ''
      ].join('\r\n');
      this.ssdp.send(msg, SSDP_PORT, SSDP_ADDR);
    }
  }

  stop() {
    clearInterval(this.notifyTimer);
    try { this.notify('ssdp:byebye'); } catch {}
    this.ssdp?.close();
    this.http?.close();
  }
}

module.exports = Dial;
