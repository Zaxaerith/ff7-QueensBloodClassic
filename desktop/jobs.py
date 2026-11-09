"""One asynchronous writer; existing qb-assets CLI remains the producer.
SPDX-License-Identifier: GPL-3.0-only
"""
from collections import deque
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from uuid import uuid4
from pack import verify_pack

# Embedded CPython intentionally omits the script directory from sys.path.
# This fixed bootstrap runs the unchanged CLI, with every path/option passed as
# a separate argv value. It is Python code, never a Shell string or user code.
CLI_BOOTSTRAP = "import sys,runpy,pathlib; entry=sys.argv.pop(1); sys.path.insert(0,str(pathlib.Path(entry).parent)); sys.argv[0]=entry; runpy.run_path(entry,run_name='__main__')"


def card_selection(value):
    if value == 'all':
        return 'all', list(range(1, 146))
    if not isinstance(value, str) or not re.fullmatch(r'\d{1,3}(,\d{1,3}){0,144}', value):
        raise ValueError('Use all or card IDs such as 041,086,106')
    cards = [int(x) for x in value.split(',')]
    if len(cards) != len(set(cards)) or any(not 1 <= x <= 145 for x in cards):
        raise ValueError('Card IDs must be unique and between 001 and 145')
    return ','.join(f'{x:03}' for x in sorted(cards)), sorted(cards)


class Jobs:
    def __init__(self, root, data, python=None):
        self.root, self.data = Path(root), Path(data)
        # A windowed Python launcher must still use a console-capable interpreter
        # for child stdout/stderr, hidden via CREATE_NO_WINDOW on Windows.
        executable = Path(python or sys.executable)
        self.python = str(executable.with_name('python.exe') if executable.name.lower() == 'pythonw.exe' else executable)
        self.lock = threading.RLock()
        self.state = dict(id=None, kind=None, status='idle', completed=0, requested=0, failures=[], events=[])
        self._cancel = None
        self._process = None
        self.result_pack = None
        self.names = {c['cardId']: c['name'] for c in json.loads((self.root / 'data/card-index.json').read_text('utf-8'))['cards']}

    @property
    def busy(self):
        with self.lock:
            return self.state['status'] in ('running', 'cancelling')

    def snapshot(self):
        with self.lock:
            return copy.deepcopy(self.state)

    def start(self, kind, source=None, cards='all', pack=None):
        if kind not in ('inspect', 'plan', 'build', 'verify'):
            raise ValueError('Unsupported job')
        selection, ids = card_selection(cards)
        with self.lock:
            if self.busy:
                raise ValueError('A task is already running; wait or cancel it first')
            job_id = uuid4().hex
            self.state = dict(id=job_id, kind=kind, status='running', completed=0,
                              requested=len(ids) if kind == 'build' else 0, failures=[], events=[], result=None,
                              current=None, message='Starting task', seconds=0)
            self.result_pack = None
            token_dir = self.data / 'jobs'
            token_dir.mkdir(parents=True, exist_ok=True)
            self._cancel = token_dir / (job_id + '.cancel')
            self._process = None
            output = None
            if kind == 'build':
                output = self.data / 'packs' / (datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-') + job_id[:8])
                self.state['output'] = str(output)
            thread = threading.Thread(target=self._run, args=(kind, source, selection, output, pack), daemon=True, name='qb-generator')
            thread.start()
            return dict(ok=True, jobId=job_id)

    def cancel(self):
        with self.lock:
            if not self.busy:
                return dict(ok=False, message='No task is running')
            self._cancel.touch(exist_ok=True)
            self.state['status'] = 'cancelling'
            self.state['message'] = 'Cancellation requested; waiting for generator stage boundary'
            return dict(ok=True)

    def _run(self, kind, source, cards, output, pack):
        started = time.monotonic()
        errors = deque(maxlen=12)
        try:
            if kind == 'verify':
                verified = verify_pack(pack)
                with self.lock:
                    self.result_pack = verified
                    self.state['result'] = verified.summary()
                status, message = 'complete', 'Art Pack v1 validated'
            else:
                if getattr(sys, 'frozen', False):
                    worker = Path(sys.executable).with_name('qb-assets-worker.exe')
                    if not worker.is_file():
                        raise ValueError('Portable generator worker is missing; extract the complete ZIP')
                    args = [str(worker), kind, '--source', str(source)]
                else:
                    args = [self.python, '-c', CLI_BOOTSTRAP, str(self.root / 'tools/qb-assets.py'), kind, '--source', str(source)]
                if kind != 'inspect':
                    args += ['--cards', cards]
                if kind == 'build':
                    args += ['--out', str(output), '--jsonl', '--cancel-file', str(self._cancel)]
                else:
                    args += ['--json']
                environment = dict(os.environ)
                if getattr(sys, 'frozen', False):
                    environment['QB_GENERATOR_PARENT_PID'] = str(os.getpid())
                process = subprocess.Popen(args, shell=False, cwd=self.root, env=environment, stdin=subprocess.DEVNULL,
                                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                           encoding='utf-8', errors='replace', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                with self.lock:
                    self._process = process
                def drain_errors():
                    try:
                        for line in process.stderr:
                            errors.append(line[-2000:].rstrip())
                    finally:
                        process.stderr.close()
                reader = threading.Thread(target=drain_errors, daemon=True)
                reader.start()
                successful = set()
                protocol_error = None
                documents = []
                for line in process.stdout:
                    if len(line) > 4 * 1024 * 1024:
                        protocol_error = 'Generator JSON line exceeds host limit'
                        self.cancel()
                        continue
                    try:
                        event = json.loads(line)
                        if not isinstance(event, dict):
                            raise ValueError('Expected JSON object')
                    except (ValueError, json.JSONDecodeError):
                        protocol_error = 'Generator emitted invalid JSON'
                        self.cancel()
                        continue
                    with self.lock:
                        if kind != 'build':
                            documents.append(event)
                        else:
                            self.state['events'] = (self.state['events'] + [event])[-12:]
                            cid = event.get('cardId')
                            if event.get('event') == 'card-start':
                                self.state['current'] = dict(cardId=cid, name=self.names.get(cid, 'Unknown'))
                            elif event.get('event') == 'card-success' and type(cid) is int:
                                successful.add(cid)
                                self.state['completed'] = len(successful)
                            elif event.get('event') == 'card-failed':
                                self.state['failures'].append(event)
                        self.state['seconds'] = round(time.monotonic() - started, 1)
                process.stdout.close()
                code = process.wait()
                reader.join(timeout=2)
                if protocol_error:
                    raise ValueError(protocol_error)
                if kind != 'build':
                    if len(documents) != 1:
                        raise ValueError('Generator returned no unique result')
                    with self.lock:
                        self.state['result'] = documents[0]
                    status = 'complete' if code == 0 and documents[0].get('ok') is True else 'failed'
                    message = 'Check complete' if status == 'complete' else documents[0].get('message', 'Source check failed; see archive/card details')
                elif code == 0:
                    verified = verify_pack(output)
                    # Do not trust exit code alone or a forged success count.
                    report = json.loads((output / 'build-report.json').read_text('utf-8'))
                    _, ids = card_selection(cards)
                    if set(report.get('completedCards', [])) != set(ids) or successful != set(ids):
                        raise ValueError('Generator completion/report/Card ID mismatch')
                    with self.lock:
                        self.result_pack = verified
                        self.state['result'] = verified.summary()
                    status, message = 'complete', 'Generation and Art Pack v1 verification complete'
                elif code == 130:
                    status, message = 'cancelled', 'Cancelled; incomplete output is not loadable. Existing packs are unchanged.'
                else:
                    status, message = 'failed', 'Generator failed; incomplete output is not loadable'
                with self.lock:
                    if self.state['status'] == 'cancelling':
                        # A completed child racing with cancel is never silently
                        # published. Its report may be inspected on the next run.
                        status, message = 'cancelled', 'Task cancelled; no pack was activated'
                        self.result_pack = None
            with self.lock:
                if self.state['status'] == 'cancelling':
                    status, message = 'cancelled', 'Task cancelled'
                    self.result_pack = None
                self.state.update(status=status, message=message, stderr=list(errors), seconds=round(time.monotonic() - started, 1))
        except Exception as error:
            with self.lock:
                self.result_pack = None
                self.state.update(status='failed', message=str(error), stderr=list(errors), seconds=round(time.monotonic() - started, 1))
        finally:
            with self.lock:
                self._process = None
