const os = require('os');

// IP da rede local (ignora loopback, APIPA e adaptadores virtuais com IP público)
function lanIp() {
  const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && priv.test(a.address)) found.push({ name, ip: a.address });
    }
  }
  const real = found.find((f) => !/vethernet|wsl|virtualbox|vmware|hyper-v|docker/i.test(f.name));
  return (real || found[0] || { ip: '127.0.0.1' }).ip;
}

module.exports = { lanIp };
