"""Synthetic desktop boundary tests; no game files or GUI required. GPL-3.0-only."""
from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor
import http.client
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from controller import Controller, detect_ff7_source
from jobs import Jobs, card_selection
from pack import verify_pack, relative_path, PackError
from server import ResourceHost, verify_audio_pack, AudioPackError
from windows import allowed_message, BRIDGE_METHODS, Bridge
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def synthetic_pack(root, count=1):
    root.mkdir(parents=True)
    (root / 'portraits').mkdir()
    Image.new('RGBA', (8, 12), (20, 40, 100, 255)).save(root / 'portraits/card-041.png')
    data = (root / 'portraits/card-041.png').read_bytes()
    manifest = dict(version=1, cards=[dict(cardId=i if count > 1 else 41, ff7OriginalEntityId='synthetic:test',
                                         modelSources={}, portraitPath='portraits/card-041.png', preview3dPath=None) for i in range(1, count + 1)])
    report = dict(schema='qb-local-asset-report', version=1, ok=True,
                  generatedFiles=[dict(path='portraits/card-041.png', size=len(data), sha256=sha256(data).hexdigest())])
    write(root / 'visual-manifest.json', manifest)
    write(root / 'build-report.json', report)
    return manifest, report


def synthetic_wav(sample_rate=44100, frames=64):
    channels = 2
    bits = 16
    block_align = channels * (bits // 8)
    byte_rate = sample_rate * block_align
    pcm = b'\x00' * (frames * block_align)
    fmt_chunk = b'fmt ' + struct.pack('<IHHIIHH', 16, 1, channels, sample_rate, byte_rate, block_align, bits)
    data_chunk = b'data' + struct.pack('<I', len(pcm)) + pcm
    body = b'WAVE' + fmt_chunk + data_chunk
    return b'RIFF' + struct.pack('<I', len(body)) + body


def synthetic_audio_pack(root):
    root.mkdir(parents=True)
    wav_bytes = synthetic_wav(44100, 64)
    (root / 'match.wav').write_bytes(wav_bytes)
    (root / 'victory.wav').write_bytes(wav_bytes)
    config = dict(
        version=1,
        tracks=dict(
            matchLoop=dict(wav='match.wav', loop=dict(sampleRateHz=44100, startFrame=0, endFrameExclusive=64)),
            victory=dict(wav='victory.wav'),
        ),
    )
    write(root / 'audio-pack.local.json', config)
    return config, wav_bytes


def synthetic_dist(dist):
    dist.mkdir(parents=True)
    (dist / 'index.html').write_text('<!doctype html><html><head><title>QB</title></head><body>synthetic</body></html>', 'utf-8')
    (dist / 'catalog.json').write_text('{}', 'utf-8')
    (dist / 'assets').mkdir()
    (dist / 'assets/bot.worker-test.js').write_text('self.onmessage=()=>{}', 'utf-8')


def write(path, value):
    path.write_text(json.dumps(value), 'utf-8')


class PackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qb-desktop-')
        self.root = Path(self.temp.name) / 'pack'
        self.manifest, self.report = synthetic_pack(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_v1_and_frozen_runtime_only(self):
        (self.root / 'secret.lgp').write_bytes(b'not game data')
        pack = verify_pack(self.root)
        self.assertEqual(pack.summary()['portraits'], 1)
        self.assertEqual(set(pack.files), {'classic/visual-manifest.json', 'classic/portraits/card-041.png'})
        original = pack.files['classic/portraits/card-041.png']
        (self.root / 'portraits/card-041.png').write_bytes(b'changed after validation')
        self.assertEqual(pack.files['classic/portraits/card-041.png'], original)
        with self.assertRaises(PackError):
            verify_pack(self.root)

    def test_failed_cancelled_or_unknown_report_rejected(self):
        for patch in [dict(ok=False), dict(status='cancelled'), dict(version=2), dict(version=True)]:
            write(self.root / 'build-report.json', {**self.report, **patch})
            with self.assertRaises(PackError):
                verify_pack(self.root)

    def test_id_and_manifest_versions(self):
        for cid in [0, 146, True, 1.2, 9007199254740992]:
            self.manifest['cards'][0]['cardId'] = cid
            write(self.root / 'visual-manifest.json', self.manifest)
            with self.assertRaises(PackError):
                verify_pack(self.root)
        self.manifest['cards'][0]['cardId'] = 1000
        write(self.root / 'visual-manifest.json', self.manifest)
        self.assertEqual(verify_pack(self.root).cards[0]['cardId'], 1000)

    def test_duplicate_ids(self):
        self.manifest['cards'] *= 2
        write(self.root / 'visual-manifest.json', self.manifest)
        with self.assertRaises(PackError):
            verify_pack(self.root)

    def test_hash_size_and_png(self):
        for patch in [dict(sha256='0'*64), dict(size=1), dict(size=True)]:
            report = {**self.report, 'generatedFiles': [{**self.report['generatedFiles'][0], **patch}]}
            write(self.root / 'build-report.json', report)
            with self.assertRaises(PackError):
                verify_pack(self.root)
        data = b'not a PNG'
        (self.root / 'portraits/card-041.png').write_bytes(data)
        self.report['generatedFiles'][0].update(size=len(data), sha256=sha256(data).hexdigest())
        write(self.root / 'build-report.json', self.report)
        with self.assertRaises((ValueError, OSError)):
            verify_pack(self.root)

    def test_paths_models_reserved_3d(self):
        for path in ['../x', '/x', 'C:/x', 'a\\b', 'a/%2e', 'a//b', 'a/./b', 'x?y', 'x#y', 'x\0y']:
            with self.assertRaises(PackError):
                relative_path(path)
        for change in [dict(portraitPath='../../outside.png'), dict(preview3dPath='models/preview.json'),
                       dict(modelSources={'magic': dict(resourceId='x')}),
                       dict(modelSources={'battle': dict(resourceId='')} )]:
            value = {**self.manifest, 'cards': [{**self.manifest['cards'][0], **change}]}
            write(self.root / 'visual-manifest.json', value)
            with self.assertRaises(PackError):
                verify_pack(self.root)

    def test_node_v1_validator_parity(self):
        # Independent adapter parity against the unchanged authoritative JS v1.
        code = "import {inspectPrivatePack} from './tools/private-pack.mjs'; try { const p=inspectPrivatePack(process.cwd(),process.argv[1],{allowExternal:true}); console.log(JSON.stringify({ids:p.manifest.cards.map(c=>c.cardId),files:[...p.files.keys()].sort()})); } catch(e) {process.exit(1)}"
        good = subprocess.run(['node', '--input-type=module', '-e', code, str(self.root)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertEqual(json.loads(good.stdout)['files'], sorted(verify_pack(self.root).files))
        self.report['ok'] = False
        write(self.root / 'build-report.json', self.report)
        bad = subprocess.run(['node', '--input-type=module', '-e', code, str(self.root)], cwd=ROOT, capture_output=True)
        self.assertNotEqual(bad.returncode, 0)


class AudioPackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qb-desktop-audio-')
        self.root = Path(self.temp.name) / 'audio'
        self.config, self.wav = synthetic_audio_pack(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_valid_audio_pack_and_frozen_bytes(self):
        audio = verify_audio_pack(self.root)
        self.assertEqual(audio.summary()['tracks'], ['matchLoop', 'victory'])
        self.assertEqual(audio.summary()['count'], 2)
        self.assertEqual(set(audio.files), {'/game/private-audio/matchLoop.wav', '/game/private-audio/victory.wav'})
        self.assertEqual(audio.bootstrap['version'], 1)
        self.assertEqual(audio.bootstrap['tracks']['matchLoop']['url'], '/game/private-audio/matchLoop.wav')
        self.assertEqual(audio.bootstrap['tracks']['victory']['url'], '/game/private-audio/victory.wav')
        # Mutating file on disk after verification must not affect frozen memory buffer.
        (self.root / 'match.wav').write_bytes(b'corrupted')
        self.assertEqual(audio.files['/game/private-audio/matchLoop.wav'], self.wav)
        with self.assertRaises(AudioPackError):
            verify_audio_pack(self.root)

    def test_rejects_traversal_bad_wav_and_bad_loop(self):
        bad_configs = [
            dict(version=2, tracks=self.config['tracks']),
            dict(version=1, tracks={}),
            dict(version=1, tracks=dict(victory=dict(wav='../escape.wav'))),
            dict(version=1, tracks=dict(victory=dict(wav='C:/windows/test.wav'))),
            dict(version=1, tracks=dict(matchLoop=dict(wav='match.wav'))),
            dict(version=1, tracks=dict(matchLoop=dict(wav='match.wav', loop=dict(sampleRateHz=44100, startFrame=0, endFrameExclusive=999)))),
            dict(version=1, tracks=dict(matchLoop=dict(wav='match.wav', loop=dict(sampleRateHz=48000, startFrame=0, endFrameExclusive=64)))),
        ]
        for bad in bad_configs:
            write(self.root / 'audio-pack.local.json', bad)
            with self.assertRaises(AudioPackError):
                verify_audio_pack(self.root)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qb-desktop-http-')
        self.dist = Path(self.temp.name) / 'dist'
        synthetic_dist(self.dist)
        self.host = ResourceHost(self.dist, ROOT / 'desktop/ui', port=0)
        self.host.start()
        self.cookie = 'qb_desktop=' + self.host.cookie

    def tearDown(self):
        self.host.close()
        self.temp.cleanup()

    def request(self, path, auth=True, host=None, method='GET'):
        conn = http.client.HTTPConnection('127.0.0.1', self.host.port)
        headers = {'Host': host or f'127.0.0.1:{self.host.port}'}
        if auth:
            headers['Cookie'] = self.cookie
        conn.request(method, path, headers=headers)
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_auth_bootstrap_and_host(self):
        self.assertEqual(self.request('/game/', auth=False)[0], 403)
        code, headers, _ = self.request('/?launch=' + self.host.token, auth=False)
        self.assertEqual(code, 303)
        self.assertEqual(headers['Location'], '/')
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])
        self.assertEqual(self.request('/game/', host='attacker.invalid')[0], 403)
        self.assertEqual(self.request('/game/')[0], 200)

    def test_default_landing_redirect(self):
        self.host.set_default_landing('/game/')
        code, headers, _ = self.request('/?launch=' + self.host.token, auth=False)
        self.assertEqual(code, 303)
        self.assertEqual(headers['Location'], '/game/')
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.host.set_default_landing('/')
        code, headers, _ = self.request('/?launch=' + self.host.token, auth=False)
        self.assertEqual((code, headers['Location']), (303, '/'))
        with self.assertRaises(ValueError):
            self.host.set_default_landing('/evil/')

    def test_no_arbitrary_files_or_endpoints(self):
        for path in ['/build-report.json', '/game/../secret', '/game/%2e%2e/secret', '/game/classic/models/test.json',
                     '/game/classic/visual-manifest.json', '/game/assets/missing.js', '/game/?x=1', '/api/read',
                     '/game/private-audio/audio-pack.local.json']:
            self.assertEqual(self.request(path)[0], 404, path)
        self.assertEqual(self.request('/', method='POST')[0], 405)

    def test_worker_mime_and_png_only_pack(self):
        self.assertIn('javascript', self.request('/game/assets/bot.worker-test.js')[1]['Content-Type'])
        pack = Path(self.temp.name) / 'pack'
        synthetic_pack(pack)
        self.host.set_pack(verify_pack(pack))
        self.assertEqual(self.request('/game/classic/portraits/card-041.png')[0], 200)
        self.assertEqual(self.request('/game/classic/build-report.json')[0], 404)
        self.assertEqual(self.request('/game/classic/models/test.json')[0], 404)
        self.host.set_pack(None)
        self.assertEqual(self.request('/game/classic/portraits/card-041.png')[0], 404)

    def test_private_audio_serving_and_html_injection(self):
        audio_dir = Path(self.temp.name) / 'audio'
        _, wav_bytes = synthetic_audio_pack(audio_dir)
        verified = verify_audio_pack(audio_dir)
        base_html = self.host.files['/game/']

        self.host.set_audio(verified)
        code, headers, body = self.request('/game/private-audio/matchLoop.wav')
        self.assertEqual(code, 200)
        self.assertEqual(headers['Content-Type'], 'audio/wav')
        self.assertIn("media-src 'self'", headers['Content-Security-Policy'])
        self.assertEqual(body, wav_bytes)
        self.assertEqual(self.request('/game/private-audio/audio-pack.local.json')[0], 404)

        code, headers, html_bytes = self.request('/game/')
        self.assertEqual(code, 200)
        self.assertIn("media-src 'self'", headers['Content-Security-Policy'])
        html = html_bytes.decode('utf-8')
        match = re.search(r'<script id="qb-private-audio" type="application/json">(.*?)</script></head>', html)
        self.assertIsNotNone(match, html)
        payload = json.loads(match.group(1))
        self.assertEqual(payload['version'], 1)
        self.assertEqual(payload['tracks']['matchLoop']['url'], '/game/private-audio/matchLoop.wav')
        self.assertEqual(payload['tracks']['victory']['url'], '/game/private-audio/victory.wav')
        # In-memory injection must not mutate frozen base HTML.
        self.assertEqual(self.host.files['/game/'], base_html)

        self.host.set_audio(None)
        self.assertEqual(self.request('/game/private-audio/matchLoop.wav')[0], 404)
        self.assertNotIn(b'qb-private-audio', self.request('/game/')[2])

    def test_fixed_port_conflict(self):
        with self.assertRaises(OSError):
            ResourceHost(self.dist, ROOT / 'desktop/ui', port=self.host.port)

    def test_burst_requests_and_bootstrap_framing(self):
        # Collection/portrait bursts must not exhaust the stdlib default backlog.
        with ThreadPoolExecutor(max_workers=20) as pool:
            responses = list(pool.map(lambda _: self.request('/game/')[0], range(80)))
        self.assertEqual(responses, [200]*80)
        code, headers, body = self.request('/?launch=' + self.host.token, auth=False)
        self.assertEqual((code, headers['Content-Length'], body), (303, '0', b''))

    def test_reject_private_or_unreviewed_dist(self):
        (self.dist / 'portraits').mkdir()
        (self.dist / 'portraits/card.png').write_bytes(b'private')
        with self.assertRaises(ValueError):
            ResourceHost(self.dist, ROOT / 'desktop/ui', port=0)

    def test_origin_and_bridge_method_allowlist(self):
        for url in ['https://example.com/', 'file:///x', self.host.origin + '/untrusted.html', self.host.origin + '.evil/', 'about:blank']:
            self.assertFalse(self.host.trusted(url))
        self.assertTrue(self.host.trusted(self.host.origin + '/game/'))
        self.assertEqual({n for n in dir(Bridge) if not n.startswith('_')}, set(BRIDGE_METHODS))
        for name in ('auto_detect_source', 'choose_audio_pack', 'clear_audio_pack', 'set_auto_enter'):
            self.assertIn(name, BRIDGE_METHODS)
        for name in ['_controller.jobs.start', 'eval', '__dict__', 'window.load_url']:
            self.assertFalse(allowed_message(json.dumps([name, '{}', '1'])))
        for name in BRIDGE_METHODS:
            self.assertTrue(allowed_message(json.dumps([name, '{}', '1'])))


class JobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qb-desktop-job-')
        self.root = Path(self.temp.name)
        (self.root / 'tools').mkdir()
        (self.root / 'data').mkdir(parents=True, exist_ok=True)
        write(self.root / 'data/card-index.json', {'cards': [{'cardId': 41, 'name': 'Synthetic'}]})
        # A synthetic child exercises the actual stdout/err/cancel subprocess path.
        code = '''import sys,json,time,pathlib
args=sys.argv; kind=args[1]; source=args[args.index('--source')+1]
emit=lambda v: print(json.dumps(v),flush=True)
if kind!='build':
 emit(dict(ok=source!='missing',archives=[],message='missing archive' if source=='missing' else 'checked'));sys.exit(0 if source!='missing' else 1)
out=pathlib.Path(args[args.index('--out')+1]); token=pathlib.Path(args[args.index('--cancel-file')+1]);out.mkdir(parents=True)
report=dict(schema='qb-local-asset-report',version=1,ok=False,status='in-progress',generatedFiles=[])
save=lambda: (out/'build-report.json').write_text(json.dumps(report))
save();emit(dict(event='build-start'));emit(dict(event='card-start',cardId=41))
for _ in range(50 if source=='slow' else 1):
 if token.exists():
  report.update(status='cancelled');save();emit(dict(event='build-result',ok=False,status='cancelled'));sys.exit(130)
 time.sleep(.02)
if source=='failure':
 emit(dict(event='card-failed',cardId=41,message='synthetic failure'));sys.exit(1)
from PIL import Image
from hashlib import sha256
(out/'portraits').mkdir();Image.new('RGBA',(8,12)).save(out/'portraits/card-041.png');data=(out/'portraits/card-041.png').read_bytes()
(out/'visual-manifest.json').write_text(json.dumps(dict(version=1,cards=[dict(cardId=41,portraitPath='portraits/card-041.png')])))
report.update(ok=True,status='complete',completedCards=[41],generatedFiles=[dict(path='portraits/card-041.png',sha256=sha256(data).hexdigest())]);save()
emit(dict(event='card-success',cardId=41));emit(dict(event='build-result',ok=True,status='complete'))
'''
        (self.root / 'tools/qb-assets.py').write_text(code, 'utf-8')
        self.jobs = Jobs(self.root, self.root / 'user data with spaces')

    def tearDown(self):
        if self.jobs.busy:
            self.jobs.cancel()
        self.wait()
        self.temp.cleanup()

    def wait(self):
        deadline = time.monotonic()+8
        while self.jobs.busy and time.monotonic()<deadline:
            time.sleep(.025)
        self.assertFalse(self.jobs.busy, self.jobs.snapshot())
        return self.jobs.snapshot()

    def test_card_ids_are_arguments_not_shell(self):
        for value in ['all; echo oops', '1,1', '../x', '146', True]:
            with self.assertRaises(ValueError):
                card_selection(value)
        self.assertEqual(card_selection('086,041')[0], '041,086')

    def test_success_and_no_overwrite(self):
        self.jobs.start('build', source='ok', cards='041')
        first = self.wait()
        self.assertEqual(first['status'], 'complete', first)
        self.assertEqual(first['completed'], 1)
        self.assertIsNotNone(self.jobs.result_pack)
        before = (Path(first['output']) / 'portraits/card-041.png').read_bytes()
        self.jobs.start('build', source='ok', cards='041')
        second = self.wait()
        self.assertNotEqual(first['output'], second['output'])
        self.assertEqual(before, (Path(first['output']) / 'portraits/card-041.png').read_bytes())

    def test_cancel_and_single_writer(self):
        self.jobs.start('build', source='slow', cards='041')
        with self.assertRaises(ValueError):
            self.jobs.start('inspect', source='ok')
        self.jobs.cancel()
        result = self.wait()
        self.assertEqual(result['status'], 'cancelled')
        self.assertIsNone(self.jobs.result_pack)
        report = json.loads((Path(result['output']) / 'build-report.json').read_text())
        self.assertFalse(report['ok'])

    def test_failure_does_not_activate(self):
        self.jobs.start('build', source='failure', cards='041')
        result = self.wait()
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['failures'][0]['cardId'], 41)
        self.assertIsNone(self.jobs.result_pack)

    def test_inspect_and_missing_archive(self):
        self.jobs.start('inspect', source='missing')
        self.assertEqual(self.wait()['status'], 'failed')
        self.jobs.start('plan', source='ok')
        self.assertEqual(self.wait()['status'], 'complete')


class ControllerTests(unittest.TestCase):
    def test_corrupt_settings_and_foreign_bridge(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            (data / 'desktop-settings.json').write_text('{broken', 'utf-8')
            class Host:
                default_landing = '/game/'
                def trusted(self, url):
                    return url == 'http://127.0.0.1:38771/'
                def set_default_landing(self, path):
                    self.default_landing = path
            class Window:
                def get_current_url(self):
                    return 'https://untrusted.example/'
            host = Host()
            c = Controller(ROOT, data, host)
            self.assertIn('could not be read', c.notice)
            self.assertEqual(host.default_landing, '/')
            c.window = Window()
            with self.assertRaises(ValueError):
                c.start_generation('041')
            self.assertFalse(c.jobs.busy)

    def test_failed_new_pack_keeps_old_verified_pack(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            synthetic_pack(data / 'old-pack')
            class Host:
                def trusted(self, url):
                    return True
            class Window:
                def get_current_url(self):
                    return 'http://127.0.0.1:38771/'
            c = Controller(ROOT, data, Host())
            c.window = Window()
            c.pack = verify_pack(data / 'old-pack')
            c.jobs.start('verify', pack=data / 'missing')
            deadline = time.monotonic()+3
            while c.jobs.busy and time.monotonic()<deadline:
                time.sleep(.01)
            self.assertEqual(c.status()['pack']['portraits'], 1)
            self.assertEqual(c.status()['job']['status'], 'failed')

    def test_startup_auto_verify_and_auto_enter_game(self):
        with tempfile.TemporaryDirectory() as temp:
            root_tmp = Path(temp)
            dist = root_tmp / 'dist'
            synthetic_dist(dist)
            pack_dir = root_tmp / 'pack'
            synthetic_pack(pack_dir, 145)
            audio_dir = root_tmp / 'audio'
            synthetic_audio_pack(audio_dir)
            data = root_tmp / 'data'
            data.mkdir()
            write(data / 'desktop-settings.json', dict(
                version=1,
                source=None,
                pack=str(pack_dir),
                audioPack=str(audio_dir),
                autoEnterGame=True,
                preferPlain=False,
            ))
            host = ResourceHost(dist, ROOT / 'desktop/ui', port=0)
            host.start()
            try:
                c = Controller(ROOT, data, host)
                self.assertIsNotNone(c.pack)
                self.assertIsNotNone(c.audio_pack)
                self.assertEqual(host.default_landing, '/game/')
                conn = http.client.HTTPConnection('127.0.0.1', host.port)
                conn.request('GET', '/?launch=' + host.token, headers={'Host': f'127.0.0.1:{host.port}'})
                res = conn.getresponse()
                res.read()
                self.assertEqual(res.status, 303)
                self.assertEqual(res.getheader('Location'), '/game/')
                conn.close()

                loaded_urls = []
                class Window:
                    def get_current_url(self):
                        return host.origin + '/game/'
                    def load_url(self, url):
                        loaded_urls.append(url)
                c.window = Window()
                c._setup_menu()
                self.assertEqual(loaded_urls[-1], host.origin + '/')

                c.set_auto_enter(False)
                self.assertEqual(host.default_landing, '/')
                saved = json.loads((data / 'desktop-settings.json').read_text('utf-8'))
                self.assertFalse(saved['autoEnterGame'])
            finally:
                host.close()

    def test_startup_moved_pack_falls_back_to_launcher(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            write(data / 'desktop-settings.json', dict(
                version=1,
                pack=str(data / 'missing-pack'),
                audioPack=str(data / 'missing-audio'),
                autoEnterGame=True,
                preferPlain=False,
            ))
            class Host:
                default_landing = '/game/'
                def set_pack(self, pack):
                    self.pack = pack
                def set_audio(self, audio):
                    self.audio = audio
                def set_default_landing(self, path):
                    self.default_landing = path
            host = Host()
            c = Controller(ROOT, data, host)
            self.assertIsNone(c.pack)
            self.assertIsNone(c.audio_pack)
            self.assertEqual(host.default_landing, '/')
            self.assertIn('Saved Art Pack', c.notice)
            self.assertIn('Saved local Audio Pack', c.notice)

    def test_partial_and_plain_do_not_default_to_auto_enter(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir(parents=True, exist_ok=True)
            write(root / 'data/card-index.json', {'cards': []})
            synthetic_pack(root / 'partial')
            write(root / 'desktop-settings.json', dict(version=1, pack=str(root / 'partial'), autoEnterGame=True, preferPlain=False))
            class Host:
                origin = 'http://127.0.0.1'
                def trusted(self, url): return True
                def set_default_landing(self, path): self.default_landing = path
            class Window:
                def get_current_url(self): return 'http://127.0.0.1/'
                def load_url(self, url): pass
            host = Host()
            c = Controller(root, root, host)
            c.window = Window()
            self.assertEqual(host.default_landing, '/')
            self.assertIn('1 张测试卡图', c.notice)
            c.set_auto_enter(True)
            c.enter_game(False)
            self.assertEqual(host.default_landing, '/game/')
            (root / 'desktop-settings.json').unlink()
            c = Controller(root, root, host)
            c.window = Window()
            c.enter_game(False)
            self.assertFalse(c.auto_enter)
            self.assertEqual(host.default_landing, '/')

    def test_detected_pack_indices_are_validated_and_mounted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir(parents=True, exist_ok=True)
            write(root / 'data/card-index.json', {'cards': []})
            synthetic_pack(root / 'queen-166', 145)
            synthetic_audio_pack(root / 'AudioPack')
            class Host:
                def trusted(self, url): return True
                def set_pack(self, pack): self.pack = pack
                def set_audio(self, audio): self.audio = audio
                def set_default_landing(self, path): self.default_landing = path
            class Window:
                def get_current_url(self): return 'http://127.0.0.1/'
            host = Host()
            c = Controller(root, root, host)
            c.window = Window()
            detected = c.detect_local_packs()
            self.assertEqual({p['kind'] for p in detected}, {'art', 'audio'})
            for invalid in (-1, 999, True, str(root / 'queen-166')):
                with self.assertRaises(ValueError): c.mount_detected_pack(invalid)
            for pack in detected: c.mount_detected_pack(pack['index'])
            self.assertEqual(c.pack.summary()['portraits'], 145)
            self.assertEqual(c.audio_pack.summary()['count'], 2)
            self.assertEqual(host.default_landing, '/game/')

    def test_detect_ff7_source_helper(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            empty_dir = base / 'empty'
            empty_dir.mkdir()
            valid_dir = base / 'FINAL FANTASY VII'
            (valid_dir / 'data/battle').mkdir(parents=True)
            (valid_dir / 'data/battle/battle.lgp').write_bytes(b'lgp')
            self.assertIsNone(detect_ff7_source([empty_dir, base / 'missing']))
            self.assertEqual(detect_ff7_source([empty_dir, valid_dir]), str(valid_dir.resolve()))
            deep = base / 'Steam Edition'
            (deep / 'ff7/workingdir/data/field').mkdir(parents=True)
            (deep / 'ff7/workingdir/data/field/char.lgp').write_bytes(b'lgp')
            self.assertEqual(detect_ff7_source([deep]), str(deep.resolve()))


if __name__ == '__main__':
    unittest.main()
