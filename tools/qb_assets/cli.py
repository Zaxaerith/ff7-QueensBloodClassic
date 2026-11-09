"""JSON/JSONL interface; no shell subprocess or implicit local configuration.
SPDX-License-Identifier: GPL-3.0-only
"""
import argparse
import json
import sys
from .core import build, parse_cards, plan
from .sources import Sources


def emit(value):
    print(json.dumps(value, ensure_ascii=False, allow_nan=False), flush=True)


def main(argv=None):
    # UTF-8 JSON on Windows pipes as well as interactive terminals.
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(prog='qb-assets', description='Offline FF7 Original personal Art Pack generator')
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('inspect', 'plan', 'build'):
        p = sub.add_parser(command)
        p.add_argument('--source', required=True, help='Selected Steam FF7 Original installation directory; read only')
        p.add_argument('--json', action='store_true', help='JSON output (already the default)')
        if command != 'inspect':
            p.add_argument('--cards', required=True, help='Stable IDs such as 041,086,095 or all (001..145)')
        if command == 'build':
            p.add_argument('--out', required=True, help='New private output directory, never an existing pack')
            p.add_argument('--jsonl', action='store_true', help='JSONL progress (already the build default)')
            p.add_argument('--cancel-file', help='Optional cancellation token: create this file to request cancellation')
    try:
        args = parser.parse_args(argv)
        if sys.version_info < (3, 11):
            raise ValueError('PYTHON_VERSION: Python 3.11+ required')
        sources = Sources(args.source)
        if args.command == 'inspect':
            result = sources.inspect(); emit(result)
            return 0 if result['ok'] else 1
        cards = parse_cards(args.cards)
        if args.command == 'plan':
            result = plan(sources, cards); emit(result)
            return 0 if result['ok'] else 1
        result = build(sources, cards, args.out, emit, args.cancel_file)
        return 0 if result['ok'] else 130 if result['status'] == 'cancelled' else 1
    except SystemExit as error:
        if error.code:
            emit(dict(ok=False, event='error', code='USAGE', message='Invalid CLI arguments; use --help'))
        return error.code
    except (ValueError, OSError, KeyError, ImportError) as error:
        emit(dict(ok=False, event='error', code='GENERATOR_ERROR', message=str(error)))
        return 1
