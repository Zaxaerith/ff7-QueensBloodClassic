"""Narrow setup bridge. No arbitrary filesystem/shell commands are exposed.
SPDX-License-Identifier: GPL-3.0-only
"""
import json
from pathlib import Path
import re
import sys
import threading
from jobs import Jobs
from pack import verify_pack, PackError
from server import verify_audio_pack, AudioPackError

DEFAULT_APP_VERSION = '1.0.0-rc.1'
STEAM_DRIVES = ('C', 'D', 'E', 'F', 'G')
STEAM_GAME_FOLDERS = (
    'FINAL FANTASY VII',
    'FINAL FANTASY VII Steam Edition',
)
STEAM_LIBRARY_RELATIVES = (
    'Program Files (x86)/Steam',
    'Program Files/Steam',
    'Steam',
    'SteamLibrary',
    'Games/Steam',
    'Games/SteamLibrary',
)
FF7_ROOTS = ((), ('data',), ('workingdir', 'data'), ('ff7', 'workingdir', 'data'))
FF7_ARCHIVE_MARKERS = ('battle/battle.lgp', 'field/char.lgp')


def _read_app_version(root):
    try:
        pkg = json.loads((Path(root) / 'package.json').read_text('utf-8'))
        if isinstance(pkg.get('version'), str) and pkg['version'].strip():
            return pkg['version'].strip()
    except (OSError, ValueError, AttributeError):
        pass
    return DEFAULT_APP_VERSION


def _looks_like_ff7_install(candidate):
    try:
        return any((candidate.joinpath(*prefix) / marker).is_file()
                   for prefix in FF7_ROOTS for marker in FF7_ARCHIVE_MARKERS)
    except OSError:
        return False


def _steam_vdf_libraries():
    libraries = []
    vdf_paths = (
        Path('C:/Program Files (x86)/Steam/steamapps/libraryfolders.vdf'),
        Path('C:/Program Files/Steam/steamapps/libraryfolders.vdf'),
    )
    for vdf in vdf_paths:
        try:
            if not vdf.is_file():
                continue
            text = vdf.read_text('utf-8', errors='ignore')
        except OSError:
            continue
        for match in re.finditer(r'"path"\s+"([^"]+)"', text):
            raw = match.group(1).replace('\\\\', '\\')
            if raw:
                libraries.append(Path(raw))
    return libraries


def _candidate_ff7_directories():
    candidates = []
    seen = set()

    def add(path):
        key = str(path).lower()
        if key not in seen:
            seen.add(key)
            candidates.append(path)

    for lib in _steam_vdf_libraries():
        for folder in STEAM_GAME_FOLDERS:
            add(lib / 'steamapps' / 'common' / folder)

    for drive in STEAM_DRIVES:
        base = Path(f'{drive}:/')
        try:
            if not base.exists():
                continue
        except OSError:
            continue
        for rel in STEAM_LIBRARY_RELATIVES:
            for folder in STEAM_GAME_FOLDERS:
                add(base / rel / 'steamapps' / 'common' / folder)
    return candidates


def detect_ff7_source(candidates=None):
    """Read-only check of standard Steam FF7 Original installation directories."""
    paths = candidates if candidates is not None else _candidate_ff7_directories()
    for path in paths:
        candidate = Path(path)
        if _looks_like_ff7_install(candidate):
            try:
                return str(candidate.resolve(strict=True))
            except OSError:
                continue
    return None


class Controller:
    def __init__(self, root, data, host):
        self.root, self.data, self.host = Path(root), Path(data), host
        self.window = None
        self.jobs = Jobs(root, data)
        self.lock = threading.RLock()
        self.source = None
        self.pack = None
        self.audio_pack = None
        self.auto_enter = False
        self.prefer_plain = False
        self.app_version = _read_app_version(self.root)
        self.notice = ''
        self._consumed = None
        self._auto_enter_configured = False
        self._settings = self.data / 'desktop-settings.json'
        self._saved_pack = None
        self._saved_audio_pack = None
        base = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else self.root
        self._pack_candidates = [('art', base / name) for name in ('ArtPack', 'queen-166', 'queen-145')] + [
            ('art', self.root / 'private-assets' / 'accepted' / name) for name in ('queen-166', 'queen-145')] + [
            ('audio', base / 'AudioPack'), ('audio', self.root / '.research-cache' / 'audio-lab')]
        self._detected_packs = None
        notices = []
        settings_loaded = False
        try:
            saved = json.loads(self._settings.read_text('utf-8'))
            if not isinstance(saved, dict) or saved.get('version') != 1:
                raise ValueError('Unsupported desktop settings')
            self.source = saved.get('source') if isinstance(saved.get('source'), str) else None
            self._saved_pack = saved.get('pack') if isinstance(saved.get('pack'), str) else None
            self._saved_audio_pack = saved.get('audioPack') if isinstance(saved.get('audioPack'), str) else None
            saved_auto = saved.get('autoEnterGame')
            if isinstance(saved_auto, bool):
                self.auto_enter = saved_auto
                self._auto_enter_configured = True
            else:
                # Backward-compatible upgrade: existing users with a saved pack get auto-enter by default.
                self.auto_enter = bool(self._saved_pack)
            saved_plain = saved.get('preferPlain')
            self.prefer_plain = saved_plain if isinstance(saved_plain, bool) else False
            settings_loaded = True
        except FileNotFoundError:
            pass
        except (ValueError, OSError, AttributeError):
            notices.append('Desktop settings could not be read. Select folders again; Game saves are unchanged.')

        if settings_loaded and self._saved_pack:
            try:
                self.pack = verify_pack(self._saved_pack)
                self._set_host_pack(self.pack if not self.prefer_plain else None)
                count = self.pack.summary()['portraits']
                if count < 145:
                    notices.append(f'当前挂载的旧卡包仅含 {count} 张测试卡图，请选择完整的 145/166 卡包或重新生成全量卡图。')
            except (PackError, ValueError, OSError):
                self.pack = None
                self._set_host_pack(None)
                notices.append('Saved Art Pack could not be verified (folder moved or modified). Select or rebuild a pack; Game saves are unchanged.')

        if settings_loaded and self._saved_audio_pack:
            try:
                self.audio_pack = verify_audio_pack(self._saved_audio_pack)
                self._set_host_audio(self.audio_pack)
            except (AudioPackError, ValueError, OSError):
                self.audio_pack = None
                self._set_host_audio(None)
                notices.append('Saved local Audio Pack could not be verified (folder moved or modified). Built-in PS1 SFX remain active.')

        if notices:
            self.notice = ' '.join(notices)
        self._sync_host_landing()

    def _set_host_pack(self, pack):
        if hasattr(self.host, 'set_pack'):
            self.host.set_pack(pack)

    def _set_host_audio(self, audio_pack):
        if hasattr(self.host, 'set_audio'):
            self.host.set_audio(audio_pack)

    def _sync_host_landing(self):
        ready = self.auto_enter and ((self.pack is not None and self.pack.summary()['portraits'] >= 145)
                                     or (self._auto_enter_configured and self.prefer_plain))
        if hasattr(self.host, 'set_default_landing'):
            self.host.set_default_landing('/game/' if ready else '/')

    def _guard(self):
        if not self.window or not self.host.trusted(self.window.get_current_url()):
            raise ValueError('Bridge is available only in the local application')

    def _save(self):
        try:
            value = dict(
                version=1,
                source=self.source,
                pack=str(self.pack.directory) if self.pack else self._saved_pack,
                audioPack=str(self.audio_pack.directory) if self.audio_pack else self._saved_audio_pack,
                autoEnterGame=self.auto_enter,
                preferPlain=self.prefer_plain,
            )
            temporary = self._settings.with_suffix('.tmp')
            temporary.write_text(json.dumps(value, ensure_ascii=False), 'utf-8')
            temporary.replace(self._settings)
        except OSError as error:
            self.notice = 'Could not save desktop preferences: ' + str(error)

    def _select(self, label):
        import webview
        self._guard()
        if self.jobs.busy:
            raise ValueError('Wait for the current task before changing folders')
        paths = self.window.create_file_dialog(webview.FileDialog.FOLDER, directory='', allow_multiple=False)
        if not paths:
            return None
        return str(Path(paths[0]).resolve(strict=True))

    def choose_source(self):
        path = self._select('FF7 Original installation')
        if path:
            with self.lock:
                self.source = path
                self.notice = ''
                self._save()
        return dict(ok=bool(path), path=path)

    def auto_detect_source(self):
        self._guard()
        if self.jobs.busy:
            raise ValueError('Wait for the current task before changing folders')
        found = detect_ff7_source()
        if found:
            with self.lock:
                self.source = found
                self.notice = ''
                self._save()
            return dict(ok=True, path=found)
        return dict(ok=False, path=None, message='No Steam FF7 Original installation found in standard directories (C:–G:). Choose the folder manually.')

    def inspect_source(self):
        self._guard()
        if not self.source:
            raise ValueError('Choose the FF7 Original installation first')
        return self.jobs.start('inspect', source=self.source)

    def plan_source(self):
        self._guard()
        if not self.source:
            raise ValueError('Choose the FF7 Original installation first')
        return self.jobs.start('plan', source=self.source)

    def start_generation(self, cards='all'):
        self._guard()
        if not self.source:
            raise ValueError('Choose the FF7 Original installation first')
        return self.jobs.start('build', source=self.source, cards=cards)

    def cancel_generation(self):
        self._guard()
        return self.jobs.cancel()

    def choose_pack(self):
        path = self._select('Completed personal Art Pack')
        return self.jobs.start('verify', pack=path) if path else dict(ok=False)

    def check_previous_pack(self):
        self._guard()
        if not self._saved_pack:
            raise ValueError('No previously selected pack')
        return self.jobs.start('verify', pack=self._saved_pack)

    def choose_audio_pack(self):
        path = self._select('Local Audio Pack folder')
        if not path:
            return dict(ok=False)
        verified = verify_audio_pack(path)
        with self.lock:
            self.audio_pack = verified
            self._saved_audio_pack = str(verified.directory)
            self.notice = ''
            self._set_host_audio(verified)
            self._save()
        return dict(ok=True, audioPack=verified.summary())

    def clear_audio_pack(self):
        self._guard()
        if self.jobs.busy:
            raise ValueError('Wait for the current task before changing folders')
        with self.lock:
            self.audio_pack = None
            self._saved_audio_pack = None
            self._set_host_audio(None)
            self._save()
        return dict(ok=True)

    def detect_local_packs(self):
        self._guard()
        detected = []
        for index, (kind, path) in enumerate(self._pack_candidates):
            try:
                pack = verify_pack(path) if kind == 'art' else verify_audio_pack(path)
                summary = pack.summary()
                if kind == 'audio' or summary['portraits'] >= 145:
                    detected.append(dict(index=index, kind=kind, **summary))
            except (PackError, AudioPackError, ValueError, OSError):
                continue
        self._detected_packs = detected
        return detected

    def mount_detected_pack(self, index):
        self._guard()
        if self.jobs.busy:
            raise ValueError('Wait for the current task before changing folders')
        if type(index) is not int or self._detected_packs is None or not any(p['index'] == index for p in self._detected_packs):
            raise ValueError('Invalid detected pack index')
        kind, path = self._pack_candidates[index]
        verified = verify_pack(path) if kind == 'art' else verify_audio_pack(path)
        with self.lock:
            if kind == 'art':
                if verified.summary()['portraits'] < 145:
                    raise ValueError('Detected Art Pack is incomplete')
                self.pack = verified
                self._saved_pack = str(verified.directory)
                self.prefer_plain = False
                if not self._auto_enter_configured:
                    self.auto_enter = True
                    self._auto_enter_configured = True
                self._set_host_pack(verified)
                self._sync_host_landing()
            else:
                self.audio_pack = verified
                self._saved_audio_pack = str(verified.directory)
                self._set_host_audio(verified)
            self.notice = ''
            self._save()
        return dict(ok=True)

    def set_auto_enter(self, enabled):
        self._guard()
        if type(enabled) is not bool:
            raise ValueError('autoEnterGame must be a boolean')
        with self.lock:
            self.auto_enter = enabled
            self._auto_enter_configured = True
            self._sync_host_landing()
            self._save()
        return dict(ok=True, autoEnterGame=self.auto_enter)

    def status(self):
        self._guard()
        with self.lock, self.jobs.lock:
            job = self.jobs.snapshot()
            if job['id'] != self._consumed and job['status'] == 'complete' and self.jobs.result_pack is not None:
                self.pack = self.jobs.result_pack
                self._consumed = job['id']
                self._saved_pack = str(self.pack.directory)
                self.prefer_plain = False
                if not self._auto_enter_configured and self.pack.summary()['portraits'] >= 145:
                    self.auto_enter = True
                    self._auto_enter_configured = True
                self.notice = ''
                self._set_host_pack(self.pack)
                self._sync_host_landing()
                self._save()
            return dict(
                source=self.source,
                pack=self.pack.summary() if self.pack else None,
                previousPack=self._saved_pack,
                audioPack=self.audio_pack.summary() if self.audio_pack else None,
                autoEnterGame=self.auto_enter,
                preferPlain=self.prefer_plain,
                appVersion=self.app_version,
                detectedPacks=self._detected_packs if self._detected_packs is not None else self.detect_local_packs(),
                job=job,
                notice=self.notice,
            )

    def enter_game(self, with_art=True):
        self._guard()
        if self.jobs.busy:
            raise ValueError('Wait for generation/validation or cancel first')
        if type(with_art) is not bool or (with_art and self.pack is None):
            raise ValueError('Choose and validate an Art Pack first')
        with self.lock:
            self.prefer_plain = not with_art
            if with_art and self.pack.summary()['portraits'] >= 145 and not self._auto_enter_configured:
                self.auto_enter = True
                self._auto_enter_configured = True
            self._set_host_pack(self.pack if with_art else None)
            self._set_host_audio(self.audio_pack)
            self._sync_host_landing()
            self._save()
        self.window.load_url(self.host.origin + '/game/')
        return dict(ok=True)

    def _setup_menu(self):
        if self.jobs.busy:
            self.notice = 'Task is running; use Cancel and wait before entering the Game.'
        self.window.load_url(self.host.origin + '/')

    def _closing(self):
        if self.jobs.busy:
            self.jobs.cancel()
            self.window.create_confirmation_dialog('Generation is stopping', 'Cancellation requested. The window stays open until the task reaches a safe boundary. Close it again when the task has stopped.')
            return False
        return True
