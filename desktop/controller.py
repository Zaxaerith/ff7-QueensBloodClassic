"""Narrow setup bridge. No arbitrary filesystem/shell commands are exposed.
SPDX-License-Identifier: GPL-3.0-only
"""
import json
from pathlib import Path
import threading
from jobs import Jobs


class Controller:
    def __init__(self, root, data, host):
        self.root, self.data, self.host = Path(root), Path(data), host
        self.window = None
        self.jobs = Jobs(root, data)
        self.lock = threading.RLock()
        self.source = None
        self.pack = None
        self.notice = ''
        self._consumed = None
        self._settings = self.data / 'desktop-settings.json'
        self._saved_pack = None
        try:
            saved = json.loads(self._settings.read_text('utf-8'))
            if saved.get('version') != 1:
                raise ValueError('Unsupported desktop settings')
            self.source = saved.get('source') if isinstance(saved.get('source'), str) else None
            self._saved_pack = saved.get('pack') if isinstance(saved.get('pack'), str) else None
        except FileNotFoundError:
            pass
        except (ValueError, OSError, AttributeError):
            self.notice = 'Desktop settings could not be read. Select folders again; Game saves are unchanged.'

    def _guard(self):
        if not self.window or not self.host.trusted(self.window.get_current_url()):
            raise ValueError('Bridge is available only in the local application')

    def _save(self):
        try:
            value = dict(version=1, source=self.source, pack=str(self.pack.directory) if self.pack else self._saved_pack)
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
                self._save()
        return dict(ok=bool(path))

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

    def status(self):
        self._guard()
        with self.lock, self.jobs.lock:
            job = self.jobs.snapshot()
            if job['id'] != self._consumed and job['status'] == 'complete' and self.jobs.result_pack is not None:
                self.pack = self.jobs.result_pack
                self._consumed = job['id']
                self._saved_pack = str(self.pack.directory)
                self._save()
            return dict(source=self.source, pack=self.pack.summary() if self.pack else None,
                        previousPack=self._saved_pack, job=job, notice=self.notice)

    def enter_game(self, with_art=True):
        self._guard()
        if self.jobs.busy:
            raise ValueError('Wait for generation/validation or cancel first')
        if type(with_art) is not bool or (with_art and self.pack is None):
            raise ValueError('Choose and validate an Art Pack first')
        self.host.set_pack(self.pack if with_art else None)
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
