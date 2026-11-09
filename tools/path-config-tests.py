"""Small synthetic checks for the parallel workspace input boundary. No models."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from assets import ROOT
from ff7_assets.local_paths import read_local_paths


class PathsTest(unittest.TestCase):
    def setUp(self):
        scratch=ROOT/'.parallel-check'
        scratch.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(prefix='paths-',dir=scratch)
        self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)

    def test_node_and_python_resolve_the_same_shared_config(self):
        config=self.folder/'qb.local.json'
        config.write_text(json.dumps(dict(version=1,sources={'battle':'input/battle.lgp'},artPacks={'batch-01':'private/batch-01'})),encoding='utf-8')
        py=read_local_paths(self.folder,config)
        result=subprocess.run(['node','--input-type=module','-e',
            "import {readLocalPaths} from './tools/local-paths.mjs';console.log(JSON.stringify(readLocalPaths(process.cwd(),process.argv[1])));",str(config)],cwd=ROOT,check=True,capture_output=True,text=True)
        self.assertEqual(py,json.loads(result.stdout))

    def test_explicit_missing_or_bad_versions_are_errors(self):
        with self.assertRaisesRegex(ValueError,'not found'):read_local_paths(self.folder,'missing.json')
        config=self.folder/'invalid.json';config.write_text('{"version":true}',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'version'):read_local_paths(self.folder,config)

    def test_battle_preflight_does_not_decode_or_write_outputs(self):
        # Deliberately not an LGP: preflight claims path/recipe validation only.
        source=self.folder/'battle.lgp';source.write_bytes(b'synthetic-not-a-model')
        config=self.folder/'qb.local.json'
        config.write_text(json.dumps(dict(version=1,sources={'battle':str(source)})),encoding='utf-8')
        out=ROOT/'private-assets/parallel-preflight-not-created'
        self.assertFalse(out.exists())
        result=subprocess.run([sys.executable,str(ROOT/'tools/battle-art.py'),'--paths',str(config),'--out',str(out),'--check-config'],cwd=ROOT,check=True,capture_output=True,text=True)
        status=json.loads(result.stdout)
        self.assertEqual(status['writes'],0);self.assertEqual(status['mode'],'check-config')
        self.assertFalse(out.exists());self.assertEqual(source.read_bytes(),b'synthetic-not-a-model')


if __name__=='__main__':unittest.main()
