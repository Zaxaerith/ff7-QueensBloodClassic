"""Small authored fixtures; never reads game or historical private art.
SPDX-License-Identifier: GPL-3.0-only
"""
import ast
import json
import signal
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from assets import ROOT, digest
from qb_assets.core import build, load_recipes, new_output, parse_cards, plan
from qb_assets.sources import Sources, requirements


def lgp(files):
    offset = 16+27*len(files)+3602; table=bytearray(); payload=bytearray()
    for name, data in files.items():
        table.extend(struct.pack('<20sIBH', name.encode(), offset+len(payload), 0, 0))
        payload.extend(struct.pack('<20sI', name.encode(), len(data))+data)
    return b'\0\0SQUARESOFT'+struct.pack('<I', len(files))+table+bytes(3602)+payload+b'FINAL FANTASY7'


def install(root, prefix='data'):
    files = {'battle/battle.lgp': {'ebaa': b'fixture', 'ebda': b'fixture', 'rtaa': b'fixture', 'rtck': b'fixture', 'rtda': b'fixture'},
             'battle/magic.lgp': {'ifreetda.d': b'fixture', 'ifreetda.a00': b'fixture'},
             'field/char.lgp': {'gajc.hrc': b'fixture', 'gbhc.a': b'fixture', 'gpcd.hrc': b'fixture', 'gpib.a': b'fixture'},
             'field/flevel.lgp': {'gldst': b'fixture', 'crcin_2': b'fixture'},
             'wm/world_us.lgp': {'aja.hrc': b'fixture', 'asc.a': b'fixture'}}
    for name, content in files.items():
        p = root/prefix/name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(lgp(content))


def fake_producer(spec, sources, folder, resolution, cancel):
    # Output fixtures deliberately contain no game pixels.
    from PIL import Image
    cancel()
    for name in ('subject.png', 'illustration.png'):
        Image.new('RGBA', (8, 8), (50, 60, 70, 200)).save(folder/name)
    return dict(cardId=spec['cardId'], fixture=True)


class GeneratorTests(unittest.TestCase):
    def setUp(self):
        qa = ROOT/'.parallel-check/r1a'; qa.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=qa, prefix='synthetic-')
        self.root = Path(self.temp.name); self.game = self.root/'game'; self.game.mkdir()
        install(self.game)

    def tearDown(self):
        self.temp.cleanup()

    def test_both_layouts_and_no_recursive_discovery(self):
        for prefix in ('data', 'workingdir/data', 'ff7/workingdir/data'):
            g = self.root/prefix.replace('/', '-'); g.mkdir(); install(g, prefix)
            self.assertTrue(Sources(g).inspect()['ok'])
        hidden = self.root/'unrelated'; hidden.mkdir(); install(hidden, 'random/elsewhere/data')
        result = Sources(hidden).inspect()
        self.assertFalse(result['ok']); self.assertEqual(result['layout'], 'unsupported-layout')

    def test_missing_unused_and_corrupt_archive_are_distinct(self):
        (self.game/'data/battle/magic.lgp').unlink()
        s = Sources(self.game)
        self.assertEqual(next(r for r in s.inspect()['archives'] if r['role']=='magic')['status'], 'missing')
        result = plan(s, [41, 106]); self.assertTrue(result['ok'])
        self.assertEqual(next(r for r in result['inspection']['archives'] if r['role']=='magic')['status'], 'not-required')
        (self.game/'data/battle/battle.lgp').write_bytes(b'not-an-lgp')
        result = Sources(self.game).inspect(['battle'])
        self.assertEqual(result['archives'][0]['status'], 'unparseable')

    def test_missing_entries_do_not_block_other_cards(self):
        (self.game/'data/battle/battle.lgp').write_bytes(lgp({'ebaa': b'x', 'ebda': b'x'}))
        result = plan(Sources(self.game), [41, 86])
        self.assertEqual([r['status'] for r in result['cards']], ['ready', 'blocked-source'])
        self.assertEqual(result['cards'][1]['problems'][0]['missingEntries'], ['rtaa', 'rtck', 'rtda'])

    def test_stable_id_routing_and_scope(self):
        self.assertEqual(parse_cards('141,041,086'), [41, 86, 141])
        for bad in ('0', '146', '041,41', 'Cloud', '41,', '../41'):
            with self.assertRaises(ValueError): parse_cards(bad)
        result = plan(Sources(self.game), [1, 41, 95, 106, 135, 141])
        self.assertEqual(result['cards'][0]['status'], 'blocked-source')
        self.assertEqual(result['cards'][4]['requiredEntries']['world'], ['aja.hrc', 'asc.a'])
        self.assertEqual(requirements(load_recipes()[1][106]), {})

    def test_ambiguous_install_is_not_silently_selected(self):
        install(self.game, 'workingdir/data')
        result = Sources(self.game).inspect(['battle'])
        self.assertEqual(result['archives'][0]['status'], 'ambiguous')

    def test_no_existing_output_or_public_or_source_writes(self):
        prior = self.root/'accepted'; prior.mkdir(); (prior/'keep.txt').write_text('keep')
        for p in (prior, self.game/'output', ROOT/'site/unsafe-art'):
            with self.assertRaises(ValueError): new_output(p, self.game)
        self.assertEqual((prior/'keep.txt').read_text(), 'keep')

    def test_pack_success_and_failed_card_preserves_success(self):
        def fail_cloud(spec, *args):
            if spec['cardId'] == 86: raise ValueError('test: missing required weapon')
            return fake_producer(spec, *args)
        out = self.root/'partial'
        report = build(Sources(self.game), [41, 86, 106], out, lambda _:None, producer=fail_cloud)
        self.assertFalse(report['ok']); self.assertEqual(report['completedCards'], [41, 106])
        self.assertEqual(len(report['failures']), 1)
        self.assertTrue((out/'041/subject.png').is_file())
        self.assertEqual([c['cardId'] for c in json.loads((out/'visual-manifest.json').read_text())['cards']], [41, 106])
        with self.assertRaisesRegex(ValueError, 'OUTPUT_EXISTS'):
            build(Sources(self.game), [86], out, lambda _:None, producer=fake_producer)
        for f in report['generatedFiles']:
            self.assertEqual(f['sha256'], digest(out/f['path']))
        retry = build(Sources(self.game), [86], self.root/'retry-one', lambda _:None, producer=fake_producer)
        self.assertTrue(retry['ok'])

    def test_cancel_after_success_never_certifies_pack(self):
        state = {'cancel':False}
        def event(e):
            if e['event'] == 'card-success': state['cancel'] = True
        report = build(Sources(self.game), [41, 86], self.root/'cancel', event,
                       producer=fake_producer, cancellation=lambda:state['cancel'])
        self.assertEqual(report['status'], 'cancelled'); self.assertFalse(report['ok'])
        self.assertEqual(report['completedCards'], [41])
        self.assertTrue((self.root/'cancel/portraits/card-041.png').is_file())
        token = self.root/'cancel-token'; token.touch()
        report = build(Sources(self.game), [106], self.root/'pre-cancel', lambda _:None,
                       cancel_file=token, producer=fake_producer)
        self.assertEqual(report['completedCards'], []); self.assertEqual(report['status'], 'cancelled')

    def test_decode_failure_is_explicit_and_original_route_survives(self):
        from qb_assets.production import produce
        report = build(Sources(self.game), [41, 106], self.root/'bad-model', lambda _:None,
                       producer=lambda spec,*args: produce(spec,*args) if spec['cardId']==41 else fake_producer(spec,*args))
        self.assertEqual(report['completedCards'], [106])
        self.assertEqual(report['failures'][0]['lastRead']['battle']['resource'], 'ebaa')
        self.assertTrue(report['failures'][0]['message'])

    def test_ctrl_c_marks_pack_cancelled_and_restores_handler(self):
        previous = signal.getsignal(signal.SIGINT)
        def interrupted(*args):
            signal.raise_signal(signal.SIGINT)
        report = build(Sources(self.game), [106], self.root/'ctrl-c', lambda _:None, producer=interrupted)
        self.assertEqual(report['status'], 'cancelled'); self.assertFalse(report['ok'])
        self.assertEqual(signal.getsignal(signal.SIGINT), previous)

    def test_cli_json_errors_and_argument_boundaries(self):
        command = [sys.executable, str(ROOT/'tools/qb-assets.py')]
        result = subprocess.run(command+['plan','--source',str(self.game),'--cards','041,106','--json'], capture_output=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertTrue(json.loads(result.stdout)['ok'])
        result = subprocess.run(command+['build','--source',str(self.game),'--cards','146','--out',str(self.root/'not-created')], capture_output=True, encoding='utf-8')
        self.assertEqual(result.returncode, 1); self.assertFalse((self.root/'not-created').exists())
        self.assertIn('INVALID_CARD_IDS', json.loads(result.stdout)['message'])
        token = self.root/'cli-cancel'; token.touch()
        result = subprocess.run(command+['build','--source',str(self.game),'--cards','106','--out',str(self.root/'cli-cancelled'),
                                        '--cancel-file',str(token)], capture_output=True, encoding='utf-8')
        self.assertEqual(result.returncode, 130)
        self.assertEqual(json.loads(result.stdout.splitlines()[-1])['status'], 'cancelled')

    def test_no_review_cache_private_config_or_subprocess_import(self):
        for s in load_recipes()[1].values():
            self.assertNotIn('reference', s); self.assertNotIn('fanRecipe', s)
        for p in (ROOT/'tools/qb_assets').glob('*.py'):
            text = p.read_text(encoding='utf-8')
            ast.parse(text, feature_version=(3, 11))
            self.assertNotIn('subprocess', text if p.name!='cli.py' else text.replace('subprocess', ''))
            self.assertNotIn('.research-cache', text); self.assertNotIn('qb.local.json', text)

    def test_all_numbered_routes_preserve_r1a_and_source_categories(self):
        from collections import Counter
        _, cards = load_recipes()
        self.assertEqual(set(cards), set(range(1, 146)))
        original = json.loads((ROOT/'data/generator/r1a-recipes.json').read_text(encoding='utf-8'))
        for s in original['cards']:self.assertEqual(cards[s['cardId']], s)
        self.assertEqual(requirements(cards[76])['battle'], ['fvaa','fvda','fwaa','fwda','fxaa','fxda'])
        self.assertEqual(requirements(cards[136]), {})
        self.assertEqual(set(requirements(cards[139])), {'field','bindings'})
        result = plan(Sources(self.game), list(range(1,146)))
        self.assertEqual(len(result['cards']),145)
        self.assertEqual(Counter(c['sourceClass'] for c in result['cards']),
                         {'og-and-procedural-layers':121,'authored-only':19,'mixed-og-and-authored':5})
        self.assertFalse(result['ok'])  # Six-root fixture is not a full installation.

    def test_all_authored_constructors_build_from_code_only(self):
        from qb_assets.production import authored
        index = json.loads((ROOT/'data/card-index.json').read_text(encoding='utf-8'))
        for c in index['cards']:
            if c['className'] not in ('authored-only','mixed-og-and-authored'):continue
            scene, textures, record = authored(c['cardId'],c['name'])
            self.assertTrue(scene,c['cardId']);self.assertEqual(record['ogMeshImports'],0)
            self.assertEqual(record['ogTextureImports'],0)
            self.assertEqual(len(record['recipeSha256']),64)

    def test_native_component_assembly_never_guesses_offsets(self):
        from types import SimpleNamespace
        from ff7_assets.render import identity
        from qb_assets.production import native
        model = dict(textures={},weapon=None,pack={'body':[{'frames':[{}]}]})
        part = dict(resourceId='fixture',geometry={},matrix=identity())
        frame = dict(bodyMatrices=[identity()],originalBodyMatrices=[identity()])
        source = dict(kind='battle',resource='fvaa',components=['fvaa','fwaa','fxaa'],pose={'animation':0,'frame':0})
        archives = SimpleNamespace(get=lambda _:SimpleNamespace(sha256='fixture'))
        with patch('qb_assets.production.load_battle',side_effect=lambda a,sk:dict(model,skeletonId=sk)), patch('qb_assets.production.assemble',return_value=([part],frame)):
            scene, _, record = native(source,archives)
            self.assertEqual([p['component'] for p in scene],source['components'])
            self.assertFalse(record['componentOffsetsApplied'])
            different=dict(frame,bodyMatrices=[identity()]);different['bodyMatrices'][0][0][3]=1
            with patch('qb_assets.production.assemble',side_effect=[([part],frame),([part],different),([part],frame)]):
                with self.assertRaisesRegex(ValueError,'origins disagree'):native(source,archives)

    def test_native_composition_does_not_force_an_authored_scene(self):
        from qb_assets.production import produce
        from ff7_assets.render import png
        folder=self.root/'composition';folder.mkdir()
        s=load_recipes()[1][107]
        image=png(8,8,bytes([1,2,3,255])*64)
        with patch('qb_assets.production.native',return_value=([],{},{})), patch('qb_assets.production.instance',return_value=([],{},{})), \
             patch('qb_assets.production.authored',side_effect=AssertionError('Unexpected authored component')), \
             patch('qb_assets.production.render_scene',return_value=(image,{})):
            produce(s,Sources(self.game),folder,8,lambda:None)
        self.assertTrue((folder/'illustration.png').is_file())

    def test_completed_payloads_hashed_once_and_partial_files_are_reported(self):
        import qb_assets.core as core
        calls=[];real_digest=core.digest
        def counted(path):calls.append(Path(path));return real_digest(path)
        out=self.root/'linear-hashes'
        with patch('qb_assets.core.digest',side_effect=counted):
            result=build(Sources(self.game),[41,86,106],out,lambda _:None,producer=fake_producer)
        self.assertTrue(result['ok'])
        self.assertEqual(calls.count(out/'041/subject.png'),1)
        def partial(spec,sources,folder,resolution,cancel):
            (folder/'subject.png').write_bytes(b'self-authored incomplete fixture')
            raise ValueError('Expected single-card failure')
        report=build(Sources(self.game),[106],self.root/'partial-file',lambda _:None,producer=partial)
        self.assertFalse(report['ok'])
        self.assertTrue(any(f['path']=='.card-106-incomplete/subject.png' for f in report['generatedFiles']))


if __name__ == '__main__':
    unittest.main(verbosity=2)
