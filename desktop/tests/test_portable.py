"""Portable resource/data boundaries; no GUI or private files. GPL-3.0-only."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import runtime_paths


class PortableTests(unittest.TestCase):
    def test_frozen_resources_are_meipass_not_executable_parent(self):
        with patch.object(sys, 'frozen', True, create=True), patch.object(sys, '_MEIPASS', 'bundle/_internal', create=True):
            self.assertEqual(runtime_paths.resource_root(), Path('bundle/_internal'))

    def test_new_data_anchor_and_relaunch(self):
        with tempfile.TemporaryDirectory() as temp:
            anchor, legacy = Path(temp)/'Saved Games', Path(temp)/'legacy'
            def folder(identifier):
                return anchor if identifier.startswith('4c5c32ff') else legacy
            with patch.object(runtime_paths, '_known_folder', side_effect=folder):
                first = runtime_paths.user_data()
                self.assertEqual(first, anchor/'data')
                self.assertEqual(runtime_paths.user_data(), first.resolve())

    def test_legacy_reuse_records_location_without_moving_files(self):
        with tempfile.TemporaryDirectory() as temp:
            anchor, legacy = Path(temp)/'anchor', Path(temp)/'legacy'
            legacy.mkdir(); (legacy/'desktop-settings.json').write_text('{}')
            native = Mock(); native.user32.MessageBoxW.return_value = 6
            with patch.object(runtime_paths, '_known_folder', side_effect=[anchor, legacy]), patch.object(runtime_paths.ctypes, 'windll', native, create=True):
                self.assertEqual(runtime_paths.user_data(), legacy)
            self.assertTrue((legacy/'desktop-settings.json').is_file())
            self.assertEqual(json.loads((anchor/'data-location.json').read_text())['path'], str(legacy.resolve()))

    def test_legacy_cancel_does_not_create_pointer(self):
        with tempfile.TemporaryDirectory() as temp:
            anchor, legacy = Path(temp)/'anchor', Path(temp)/'legacy'
            legacy.mkdir(); (legacy/'webview2').mkdir()
            native = Mock(); native.user32.MessageBoxW.return_value = 2
            with patch.object(runtime_paths, '_known_folder', side_effect=[anchor, legacy]), patch.object(runtime_paths.ctypes, 'windll', native, create=True):
                with self.assertRaises(ValueError): runtime_paths.user_data()
            self.assertFalse((anchor/'data-location.json').exists())

    def test_invalid_pointer_fails_without_replacing(self):
        with tempfile.TemporaryDirectory() as temp:
            anchor=Path(temp); pointer=anchor/'data-location.json'
            pointer.write_text('{"version":2,"path":"relative"}')
            with patch.object(runtime_paths, '_known_folder', return_value=anchor):
                with self.assertRaises(ValueError): runtime_paths.user_data()
            self.assertEqual(json.loads(pointer.read_text())['version'], 2)


if __name__ == '__main__': unittest.main()
