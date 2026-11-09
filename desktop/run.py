"""Windows development host, same frozen M5 Web Game. GPL-3.0-only."""
from pathlib import Path
import sys

# Also works under a deliberately isolated embedded CPython used for local QA.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import argparse
import ctypes
import importlib.metadata
import importlib.abc
import json
import os

from controller import Controller
from server import ResourceHost
from windows import Bridge, install_boundary
from runtime_paths import resource_root, user_data

ROOT = resource_root()


class _NoLegacyBackend(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname in ('webview.platforms.mshtml', 'webview.platforms.cef'):
            raise ImportError('Microsoft Edge WebView2 Runtime is required. Legacy browser fallback is disabled.')
        return None


def fail(message):
    if sys.platform == 'win32':
        ctypes.windll.user32.MessageBoxW(None, message, "Queen's Blood Classic · Desktop", 0x10)
    if sys.stderr:
        print(message, file=sys.stderr)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Queen\'s Blood Classic Windows desktop prototype')
    parser.add_argument('--dist', type=Path, default=ROOT / 'desktop/game', help='Explicit desktop Game artifact (node desktop/build-game.mjs)')
    parser.add_argument('--data-dir', type=Path, help='Explicit storage override; default: Saved Games/QueensBloodClassicDesktop/data-location.json')
    parser.add_argument('--check', action='store_true', help='Check dependencies and public artifact without opening a window')
    args = parser.parse_args(argv)
    host = None
    try:
        if sys.platform != 'win32' or sys.version_info < (3, 11):
            raise ValueError('Windows and Python 3.11+ are required')
        if importlib.metadata.version('pywebview') != '6.2.1':
            raise ValueError('Install desktop/requirements.txt; this native boundary is pinned to pywebview 6.2.1')
        if importlib.metadata.version('Pillow') != '13.0.0':
            raise ValueError('Pillow 13.0.0 is required by the existing art generator')
        import webview
        guilib = __import__('importlib').import_module('webview.guilib')
        # Explicit initialization lets us reject MSHTML BEFORE any window exists.
        blocker = _NoLegacyBackend()
        sys.meta_path.insert(0, blocker)
        try:
            gui = guilib.initialize('edgechromium')
        except Exception as error:
            raise ValueError('Could not start Microsoft Edge WebView2. Install the Evergreen WebView2 Runtime and .NET Framework 4.6.2+; IE/MSHTML fallback is disabled. Details: ' + str(error)) from error
        if gui.renderer != 'edgechromium':
            raise ValueError('Microsoft Edge WebView2 Runtime is required. No IE/MSHTML fallback is permitted.')
        host = ResourceHost(args.dist, ROOT / 'desktop/ui')
        if args.check:
            print(json.dumps(dict(ok=True, backend=gui.renderer, python=sys.version.split()[0],
                                  pywebview='6.2.1', origin=host.origin, gameFiles=len(host.files)-3)))
            host.close()
            host = None
            return 0
        data = (args.data_dir or user_data()).resolve()
        data.mkdir(parents=True, exist_ok=True)
        storage = data / 'webview2'
        storage.mkdir(exist_ok=True)
        controller = Controller(ROOT, data, host)
        webview.settings.update(ALLOW_FILE_URLS=False, ALLOW_DOWNLOADS=True,
                                OPEN_EXTERNAL_LINKS_IN_BROWSER=False, OPEN_DEVTOOLS_IN_DEBUG=False)
        from webview.menu import Menu, MenuAction
        window = webview.create_window("Queen's Blood Classic · Windows x64", host.launch_url,
                                       js_api=Bridge(controller), width=1280, height=820, min_size=(900, 650),
                                       background_color='#050a21', text_select=True,
                                       menu=[Menu('Desktop', [MenuAction('Resource Setup', controller._setup_menu)])])
        controller.window = window
        def secure_before_show():
            try:
                install_boundary(window, host)
            except Exception as error:
                # pywebview logs event exceptions and otherwise continues. Close
                # the native view before navigation instead of running unguarded.
                window.native.Close()
                fail('Could not install desktop security boundary: ' + str(error))
        window.events.before_show += secure_before_show
        window.events.closing += controller._closing
        host.start()
        webview.start(gui='edgechromium', private_mode=False, storage_path=str(storage), debug=False)
        return 0
    except Exception as error:
        if args.check:
            print(json.dumps(dict(ok=False, error=str(error))))
        else:
            fail(str(error))
        return 1
    finally:
        if host:
            host.close()


if __name__ == '__main__':
    raise SystemExit(main())
