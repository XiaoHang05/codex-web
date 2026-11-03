import {BlockList, isIP} from 'node:net';
import os from 'node:os';

const loopback = new BlockList();
loopback.addSubnet('127.0.0.0', 8, 'ipv4');
loopback.addAddress('::1', 'ipv6');
const privateAddresses = new BlockList();
for (const [address, prefix, family] of [
  ['10.0.0.0', 8, 'ipv4'], ['172.16.0.0', 12, 'ipv4'], ['192.168.0.0', 16, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'], ['fc00::', 7, 'ipv6'], ['fe80::', 10, 'ipv6']
]) privateAddresses.addSubnet(address, prefix, family);
const nonPublic = new BlockList();
for (const [address, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'], ['100.64.0.0', 10, 'ipv4'], ['192.0.0.0', 24, 'ipv4'],
  ['192.0.2.0', 24, 'ipv4'], ['198.18.0.0', 15, 'ipv4'], ['198.51.100.0', 24, 'ipv4'],
  ['203.0.113.0', 24, 'ipv4'], ['224.0.0.0', 3, 'ipv4'], ['::', 128, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'], ['ff00::', 8, 'ipv6']
]) nonPublic.addSubnet(address, prefix, family);

function addressInfo(value) {
  if (typeof value !== 'string' || value.length > 100) return null;
  let address = value.trim();
  // A zone identifier belongs to the socket address, not the IP itself.
  if (address.includes(':')) address = address.split('%')[0];
  const version = isIP(address);
  if (!version) return null;
  if (version === 6) {
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const mapped = canonical.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
    if (mapped) {
      const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
      address = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
      return {address, family: 'ipv4'};
    }
    address = canonical;
  }
  return {address, family: version === 4 ? 'ipv4' : 'ipv6'};
}

function onHostNetwork(ip, interfaces) {
  for (const rows of Object.values(interfaces)) for (const row of rows || []) {
    if (row.internal || !row.cidr) continue;
    const [address, prefixText] = row.cidr.split('/');
    const host = addressInfo(address), prefix = Number(prefixText);
    if (!host || host.family !== ip.family || !Number.isInteger(prefix) || prefix <= 0 || prefix > (ip.family === 'ipv4' ? 32 : 128)) continue;
    const subnet = new BlockList();
    subnet.addSubnet(host.address, prefix, host.family);
    if (subnet.check(ip.address, ip.family)) return true;
  }
  return false;
}

export function accessSource(req, {local = false} = {}, interfaces = os.networkInterfaces()) {
  const peer = addressInfo(req.socket?.remoteAddress);
  // The hub listens on loopback. Only its local reverse proxy supplies X-Real-IP,
  // which Caddy overwrites with its socket peer (not a client-supplied value).
  const proxy = peer && loopback.check(peer.address, peer.family);
  const ip = local ? peer : proxy ? addressInfo(req.headers['x-real-ip']) : null;
  let kind = 'unknown', label = '';
  if (ip) {
    const hostAddress = Object.values(interfaces).flat().some(row => addressInfo(row.address)?.address === ip.address);
    if (loopback.check(ip.address, ip.family) || hostAddress) { kind = 'local'; label = '本机'; }
    else if (privateAddresses.check(ip.address, ip.family) || onHostNetwork(ip, interfaces)) { kind = 'lan'; label = '局域网'; }
    else if (!nonPublic.check(ip.address, ip.family) && (ip.family === 'ipv4' || /^[23]/.test(ip.address))) { kind = 'public'; label = '公网'; }
  }
  return {kind, label, address: ip?.address || ''};
}

export function accessSourceRoute(req, res, {auth}) {
  if (req.path !== '/api/access-source' || req.method !== 'GET') return false;
  auth.requireSession(req);
  res.set('Cache-Control', 'no-store');
  res.json(accessSource(req, auth.context(req)));
  return true;
}
