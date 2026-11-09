"""Fixed-origin, authenticated, allowlisted loopback server.
SPDX-License-Identifier: GPL-3.0-only
"""
import hmac
from hashlib import sha256
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import socket
import threading
from runtime_paths import resource_root
from urllib.parse import urlsplit, parse_qs

PORT = 38771


class ResourceHost:
    def __init__(self, dist, ui, port=PORT):
        self.port = port
        self.origin = f'http://127.0.0.1:{port}'
        self.token = secrets.token_urlsafe(32)
        self.cookie = secrets.token_urlsafe(32)
        self.files = {}
        self.pack_files = {}
        self._lock = threading.RLock()
        self._started = False
        dist = Path(dist).resolve(strict=True)
        ui = Path(ui).resolve(strict=True)
        # Same public payload shape as the R0 public artifact gate. No arbitrary
        # directory server: freeze an explicit Game/UI allowlist at startup.
        policy = json.loads((resource_root() / 'data/release/public-distribution-policy.json').read_text('utf-8'))
        allowed = [re.compile(p) for p in policy['allowedPatterns']]
        approved = {r['sha256'] for r in policy.get('approvedEmbeddedMedia', [])}
        for path in dist.rglob('*'):
            if path.is_symlink() or not path.resolve().is_relative_to(dist):
                raise ValueError('Linked Game artifact is not allowed')
            if not path.is_file():
                continue
            rel = path.relative_to(dist).as_posix()
            if not any(p.search(rel) for p in allowed) or any(rel.startswith(p) for p in policy['forbiddenPrefixes']):
                raise ValueError('Unexpected public Game artifact: ' + rel)
            if path.stat().st_size > policy['maxFileBytes']:
                raise ValueError('Oversized public Game artifact: ' + rel)
            data = path.read_bytes()
            if b'\0' in data:
                raise ValueError('Binary public Game artifact: ' + rel)
            text = data.decode('utf-8')
            for match in re.finditer(r'data:(?:image|audio|video|model)/', text, re.I):
                at = match.start()
                quote = text[at-1] if at else ''
                end = text.find(quote if quote in ('\"', "'") else ')', at)
                digest = sha256(text[at:end].encode()).hexdigest() if end >= at else None
                if not rel.endswith('.css') or digest not in approved:
                    raise ValueError('Unapproved embedded media: ' + rel)
            self.files['/game/' + ('' if rel == 'index.html' else rel)] = data
        if any('/game/' + ('' if name == 'index.html' else name) not in self.files for name in policy['required']):
            raise ValueError('Missing required Game artifact')
        if '/game/' not in self.files or not any('bot.worker-' in p for p in self.files):
            raise ValueError('Missing Vite Game/Worker build; prepare a clean public build first')
        for name in ('index.html', 'setup.js', 'setup.css'):
            self.files['/' if name == 'index.html' else '/' + name] = (ui / name).read_bytes()
        owner = self

        class Server(ThreadingHTTPServer):
            daemon_threads = True
            allow_reuse_address = False
            request_queue_size = 128

            def server_bind(self):
                if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                    self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                super().server_bind()

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def log_message(self, *args):
                pass  # No tokens, installation paths or cookies in HTTP logs.

            def do_GET(self):
                owner._get(self)

            def do_POST(self):
                self.send_error(405)

        try:
            self.server = Server(('127.0.0.1', port), Handler)
        except OSError as error:
            raise OSError(f'Local application port 127.0.0.1:{port} is unavailable. Close the other running copy or resolve the port conflict. The application will not connect to it or change the save origin.') from error
        if port == 0:  # Only unit tests use ephemeral ports.
            self.port = self.server.server_port
            self.origin = f'http://127.0.0.1:{self.port}'

    @property
    def launch_url(self):
        return self.origin + '/?launch=' + self.token

    def trusted(self, url):
        parsed = urlsplit(url or '')
        return (f'{parsed.scheme}://{parsed.netloc}' == self.origin
                and parsed.path in ('/', '/game/') and not parsed.fragment)

    def set_pack(self, pack):
        with self._lock:
            self.pack_files = {} if pack is None else dict(pack.files)

    def start(self):
        self._started = True
        threading.Thread(target=self.server.serve_forever, daemon=True, name='qb-loopback').start()

    def close(self):
        if self._started:
            self.server.shutdown()
        self.server.server_close()

    def _get(self, request):
        if request.headers.get('Host') != f'127.0.0.1:{self.port}':
            request.send_error(403)
            return
        parsed = urlsplit(request.path)
        if parsed.scheme or parsed.netloc or parsed.fragment:
            request.send_error(404)
            return
        if parsed.path == '/' and parse_qs(parsed.query).get('launch') == [self.token]:
            request.send_response(303)
            request.send_header('Location', '/')
            request.send_header('Content-Length', '0')
            request.send_header('Set-Cookie', f'qb_desktop={self.cookie}; Path=/; HttpOnly; SameSite=Strict')
            request.send_header('Cache-Control', 'no-store')
            request.end_headers()
            return
        try:
            cookies = SimpleCookie(request.headers.get('Cookie', ''))
            authenticated = hmac.compare_digest(cookies['qb_desktop'].value, self.cookie)
        except (KeyError, ValueError, TypeError, CookieError):
            authenticated = False
        if not authenticated:
            request.send_error(403)
            return
        if parsed.query or '%' in parsed.path or '\\' in parsed.path or any(p in ('.', '..') for p in parsed.path.split('/')):
            request.send_error(404)
            return
        with self._lock:
            data = self.pack_files.get(parsed.path.removeprefix('/game/')) if parsed.path.startswith('/game/classic/') else self.files.get(parsed.path)
        if data is None:
            request.send_error(404)
            return
        mime = ('text/html; charset=utf-8' if parsed.path.endswith('/') else
                'text/javascript; charset=utf-8' if parsed.path.endswith('.js') else
                'text/css; charset=utf-8' if parsed.path.endswith('.css') else
                'application/json; charset=utf-8' if parsed.path.endswith('.json') else 'image/png')
        request.send_response(200)
        request.send_header('Content-Type', mime)
        request.send_header('Content-Length', str(len(data)))
        request.send_header('Cache-Control', 'no-store')
        request.send_header('X-Content-Type-Options', 'nosniff')
        request.send_header('Referrer-Policy', 'no-referrer')
        request.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        request.end_headers()
        request.wfile.write(data)
