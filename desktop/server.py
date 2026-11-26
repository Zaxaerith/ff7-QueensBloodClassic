"""Fixed-origin, authenticated, allowlisted loopback server.
SPDX-License-Identifier: GPL-3.0-only
"""
from dataclasses import dataclass
import hmac
from hashlib import sha256
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import socket
import struct
import threading
from runtime_paths import resource_root
from urllib.parse import urlsplit, parse_qs

PORT = 38771
AUDIO_TRACK_IDS = ('matchLoop', 'challengeLoop', 'bossLoop', 'victory')
MAX_AUDIO_CONFIG_BYTES = 64 * 1024
MAX_AUDIO_TRACK_BYTES = 64 * 1024 * 1024
MAX_AUDIO_PACK_BYTES = 128 * 1024 * 1024


class AudioPackError(ValueError):
    pass


@dataclass(frozen=True)
class VerifiedAudioPack:
    directory: Path
    tracks: tuple
    files: dict
    bootstrap: dict

    def summary(self):
        return dict(path=str(self.directory), tracks=list(self.tracks), count=len(self.tracks))


def _relative_audio_path(value):
    if (not isinstance(value, str) or not value.strip()
            or not value.lower().endswith('.wav')
            or re.search(r"^[a-z][a-z0-9+.-]*:|^[\\/]|[\\?#%\x00-\x1f]", value, re.I)
            or any(p in ('', '.', '..') for p in value.split('/'))):
        raise AudioPackError('Invalid relative WAV path in audio pack')
    return value


def _ensure_no_symlink(root, rel_parts):
    current = root
    for part in rel_parts:
        current = current / part
        if current.is_symlink():
            raise AudioPackError('Symbolic links are not allowed in audio pack')
    return current


def _inspect_wav(data):
    if len(data) < 12 or data[0:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise AudioPackError('Expected a RIFF WAVE audio file')
    riff_size = struct.unpack_from('<I', data, 4)[0]
    if riff_size + 8 != len(data):
        raise AudioPackError('Invalid RIFF WAV size header')
    sample_rate = 0
    block_align = 0
    data_size = 0
    offset = 12
    while offset + 8 <= len(data):
        chunk_id = data[offset:offset + 4]
        chunk_size = struct.unpack_from('<I', data, offset + 4)[0]
        start = offset + 8
        offset = start + chunk_size + (chunk_size % 2)
        if offset > len(data):
            raise AudioPackError('Invalid WAV chunk framing')
        if chunk_id == b'fmt ':
            if chunk_size < 16:
                raise AudioPackError('Invalid WAV fmt chunk')
            audio_format, channels, rate, _, align, bits = struct.unpack_from('<HHIIHH', data, start)
            if audio_format != 1 or channels not in (1, 2) or bits not in (16, 24, 32) or align <= 0:
                raise AudioPackError('Expected uncompressed PCM WAV (16/24/32-bit, mono/stereo)')
            sample_rate = rate
            block_align = align
        elif chunk_id == b'data':
            data_size = chunk_size
    if offset != len(data) or sample_rate <= 0 or block_align <= 0 or data_size <= 0 or data_size % block_align != 0:
        raise AudioPackError('Invalid WAV PCM sample data')
    return sample_rate, data_size // block_align


def _validate_loop(value, sample_rate, frames):
    if not isinstance(value, dict):
        raise AudioPackError('Missing loop metadata for loop track')
    rate = value.get('sampleRateHz')
    start = value.get('startFrame')
    end = value.get('endFrameExclusive')
    if (type(rate) is not int or rate != sample_rate
            or type(start) is not int or type(end) is not int
            or start < 0 or end <= start or end > frames):
        raise AudioPackError('Invalid loop bounds for WAV track')
    return dict(sampleRateHz=rate, startFrame=start, endFrameExclusive=end)


def verify_audio_pack(directory):
    """Validate audio-pack.local.json (v1) and freeze WAV bytes in memory."""
    raw_dir = Path(directory)
    if raw_dir.is_symlink():
        raise AudioPackError('Audio pack directory must not be a symbolic link')
    root = raw_dir.resolve(strict=True)
    if not root.is_dir():
        raise AudioPackError('Select a local Audio Pack directory containing audio-pack.local.json')
    config_path = _ensure_no_symlink(root, ('audio-pack.local.json',))
    try:
        resolved_cfg = config_path.resolve(strict=True)
    except OSError as error:
        raise AudioPackError('Missing audio-pack.local.json in selected folder') from error
    if resolved_cfg == root or not resolved_cfg.is_relative_to(root) or not resolved_cfg.is_file():
        raise AudioPackError('Invalid audio-pack.local.json location')
    with resolved_cfg.open('rb') as stream:
        raw_cfg = stream.read(MAX_AUDIO_CONFIG_BYTES + 1)
    if len(raw_cfg) > MAX_AUDIO_CONFIG_BYTES:
        raise AudioPackError('audio-pack.local.json exceeds size limit')
    try:
        doc = json.loads(raw_cfg.decode('utf-8-sig'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AudioPackError('audio-pack.local.json is not valid JSON') from error
    if not isinstance(doc, dict) or type(doc.get('version')) is not int or doc['version'] != 1 or not isinstance(doc.get('tracks'), dict):
        raise AudioPackError('Unsupported Audio Pack schema; expected version 1 with tracks object')

    entries = doc['tracks']
    files = {}
    bootstrap_tracks = {}
    loaded_ids = []
    total_bytes = 0

    for track_id in AUDIO_TRACK_IDS:
        entry = entries.get(track_id)
        if entry is None:
            continue
        if not isinstance(entry, dict):
            raise AudioPackError(f'Invalid track entry for {track_id}')
        rel_wav = _relative_audio_path(entry.get('wav'))
        candidate = _ensure_no_symlink(root, rel_wav.split('/'))
        try:
            target = candidate.resolve(strict=True)
        except OSError as error:
            raise AudioPackError(f'Missing WAV file for {track_id}: {rel_wav}') from error
        if target == root or not target.is_relative_to(root) or not target.is_file():
            raise AudioPackError(f'Audio track escapes pack directory: {rel_wav}')
        with target.open('rb') as stream:
            data = stream.read(MAX_AUDIO_TRACK_BYTES + 1)
        if not data or len(data) > MAX_AUDIO_TRACK_BYTES:
            raise AudioPackError(f'WAV file size out of range for {track_id}')
        total_bytes += len(data)
        if total_bytes > MAX_AUDIO_PACK_BYTES:
            raise AudioPackError('Audio pack exceeds 128 MiB desktop memory limit')
        sample_rate, frames = _inspect_wav(data)
        route = f'/game/private-audio/{track_id}.wav'
        files[route] = data
        if track_id == 'victory':
            bootstrap_tracks[track_id] = dict(url=route)
        else:
            loop = _validate_loop(entry.get('loop'), sample_rate, frames)
            bootstrap_tracks[track_id] = dict(url=route, loop=loop)
        loaded_ids.append(track_id)

    if not loaded_ids:
        raise AudioPackError('Audio pack defines no supported tracks (matchLoop/challengeLoop/bossLoop/victory)')
    bootstrap = dict(version=1, tracks=bootstrap_tracks)
    return VerifiedAudioPack(root, tuple(loaded_ids), files, bootstrap)


def _inject_audio_bootstrap(html_bytes, bootstrap_json):
    tag = f'<script id="qb-private-audio" type="application/json">{bootstrap_json}</script>'
    text = html_bytes.decode('utf-8')
    match = re.search(r'</head>', text, re.I)
    if match:
        injected = text[:match.start()] + tag + text[match.start():]
    else:
        injected = text + tag
    return injected.encode('utf-8')


class ResourceHost:
    def __init__(self, dist, ui, port=PORT):
        self.port = port
        self.origin = f'http://127.0.0.1:{port}'
        self.token = secrets.token_urlsafe(32)
        self.cookie = secrets.token_urlsafe(32)
        self.files = {}
        self.pack_files = {}
        self.audio_files = {}
        self.audio_bootstrap = None
        self.default_landing = '/'
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

    def set_default_landing(self, path):
        if path not in ('/', '/game/'):
            raise ValueError('Unsupported desktop landing path')
        with self._lock:
            self.default_landing = path

    def set_pack(self, pack):
        with self._lock:
            self.pack_files = {} if pack is None else dict(pack.files)

    def set_audio(self, audio_pack):
        with self._lock:
            if audio_pack is None:
                self.audio_files = {}
                self.audio_bootstrap = None
            else:
                self.audio_files = dict(audio_pack.files)
                raw = json.dumps(audio_pack.bootstrap, ensure_ascii=False)
                self.audio_bootstrap = raw.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')

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
            with self._lock:
                landing = self.default_landing
            request.send_response(303)
            request.send_header('Location', landing)
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
            if parsed.path.startswith('/game/classic/'):
                data = self.pack_files.get(parsed.path.removeprefix('/game/'))
            elif parsed.path.startswith('/game/private-audio/'):
                data = self.audio_files.get(parsed.path)
            else:
                data = self.files.get(parsed.path)
            audio_bootstrap = self.audio_bootstrap if parsed.path == '/game/' else None
        if data is None:
            request.send_error(404)
            return
        if audio_bootstrap is not None:
            data = _inject_audio_bootstrap(data, audio_bootstrap)
        mime = ('text/html; charset=utf-8' if parsed.path.endswith('/') else
                'text/javascript; charset=utf-8' if parsed.path.endswith('.js') else
                'text/css; charset=utf-8' if parsed.path.endswith('.css') else
                'application/json; charset=utf-8' if parsed.path.endswith('.json') else
                'audio/wav' if parsed.path.endswith('.wav') else 'image/png')
        request.send_response(200)
        request.send_header('Content-Type', mime)
        request.send_header('Content-Length', str(len(data)))
        request.send_header('Cache-Control', 'no-store')
        request.send_header('X-Content-Type-Options', 'nosniff')
        request.send_header('Referrer-Policy', 'no-referrer')
        request.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; worker-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        request.end_headers()
        request.wfile.write(data)
