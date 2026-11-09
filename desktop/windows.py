"""Pinned pywebview 6.2.1 / WebView2 boundary, installed before navigation.
SPDX-License-Identifier: GPL-3.0-only
"""
import json

BRIDGE_METHODS = frozenset(('choose_source', 'inspect_source', 'plan_source', 'start_generation',
                            'cancel_generation', 'choose_pack', 'check_previous_pack', 'status', 'enter_game'))


def allowed_message(raw):
    try:
        value = json.loads(raw)
        return (isinstance(value, list) and len(value) == 3 and
                value[0] in BRIDGE_METHODS | {'pywebviewAsyncCallback', '_pywebviewAlert'})
    except (ValueError, TypeError):
        return False


class Bridge:
    """Only named, guarded methods are listed in window.pywebview.api."""
    def __init__(self, controller):
        self._controller = controller

    def choose_source(self):
        return self._controller.choose_source()

    def inspect_source(self):
        return self._controller.inspect_source()

    def plan_source(self):
        return self._controller.plan_source()

    def start_generation(self, cards='all'):
        return self._controller.start_generation(cards)

    def cancel_generation(self):
        return self._controller.cancel_generation()

    def choose_pack(self):
        return self._controller.choose_pack()

    def check_previous_pack(self):
        return self._controller.check_previous_pack()

    def status(self):
        return self._controller.status()

    def enter_game(self, with_art=True):
        return self._controller.enter_game(with_art)


def install_boundary(window, host):
    """Native events, not an overridable page script. Fail closed on API drift."""
    native = window.native
    browser = native.browser
    view = native.webview

    def navigation(sender, args):
        if not host.trusted(str(args.Uri)):
            args.Cancel = True

    def message(sender, args):
        if host.trusted(str(view.Source)) and allowed_message(str(args.WebMessageAsJson)):
            browser.on_script_notify(sender, args)

    def popup(sender, args):
        args.Handled = True

    def ready(sender, args):
        if args.IsSuccess:
            core = view.CoreWebView2
            core.NewWindowRequested -= browser.on_new_window_request
            core.NewWindowRequested += popup

    view.NavigationStarting += navigation
    view.WebMessageReceived -= browser.on_script_notify
    view.WebMessageReceived += message
    view.CoreWebView2InitializationCompleted += ready
    # Hold delegates for the window lifetime; pythonnet must not collect them.
    window._qb_boundary = (navigation, message, popup, ready)
