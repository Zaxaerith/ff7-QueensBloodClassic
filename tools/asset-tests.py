"""Self-authored tiny binary fixtures. No game data or external packages.
SPDX-License-Identifier: GPL-3.0-only
"""
import hashlib,json,struct,subprocess,sys,tempfile,unittest
from pathlib import Path
from assets import Archive,discover,output_path,load_model,ROOT,PRIVATE
from ff7_assets.formats import parse_hrc,parse_p,parse_animation
from ff7_assets.tex import decode_tex
from ff7_assets.render import render,pose,transform,texel
from ff7_assets.battle import parse_battle_skeleton

def archive_bytes(files):
    offset=16+27*len(files)+3600+2;table=bytearray();payload=bytearray()
    for name,data in files.items():
        table.extend(struct.pack('<20sIBH',name.encode(),offset+len(payload),0,0));payload.extend(struct.pack('<20sI',name.upper().encode(),len(data))+data)
    return b'\0\0SQUARESOFT'+struct.pack('<I',len(files))+table+bytes(3602)+payload+b'FINAL FANTASY7'

def texture():
    h=[0]*59;h[0]=1;h[12]=1;h[13]=2;h[15]=2;h[16]=1;h[19]=1;h[22]=2;h[26]=1;h[49]=128
    return struct.pack('<59I',*h)+bytes([255,255,255,254,0,0,255,255])+b'\0\1'

def mesh():
    h=[0]*32;h[:3]=[1,1,1];h[3]=3;h[6]=3;h[7]=3;h[9]=1;h[12]=h[13]=h[14]=1
    group=[0]*14;group[2]=1;group[4]=3;group[12]=1
    polygon=[0,0,1,2,0,0,0,0,0,0,0,0]
    return (struct.pack('<32I',*h)+struct.pack('<9f',-1,-1,0,1,-1,0,0,1,0)+struct.pack('<6f',0,0,0,0,0,0)
            +bytes([128,128,128,255])*3+bytes(4)+struct.pack('<12H',*polygon)+bytes(100)+struct.pack('<14I',*group)+bytes(28))

def animation(bones=1):
    header=bytearray(36);struct.pack_into('<3I',header,0,1,1,bones);header[12:15]=bytes([1,0,2]);return header+bytes((6+bones*3)*4)

def files():return {'test.hrc':b':HEADER_BLOCK 2\n:SKELETON synthetic_triangle\n:BONES 1\nbody\nroot\n2\n1 part\n',
    'part.rsd':b'@RSD940102\nPLY=part.PLY\nNTEX=1\nTEX[0]=test.TIM\n','part.p':mesh(),'test.tex':texture(),'idle.a':animation()}

class AssetsTests(unittest.TestCase):
    def setUp(self):
        PRIVATE.mkdir(exist_ok=True);self.temp=tempfile.TemporaryDirectory(dir=PRIVATE,prefix='fixture-');self.folder=Path(self.temp.name)
        self.path=self.folder/'char.lgp';self.path.write_bytes(archive_bytes(files()));self.archive=Archive(self.path)
    def tearDown(self):self.temp.cleanup()
    def test_lgp_case_variant_names_and_structural_validation(self):
        self.assertEqual(self.archive.inventory['case_variant_records'],5);self.assertEqual(self.archive.read('idle.a'),animation())
        broken=bytearray(self.path.read_bytes());struct.pack_into('<I',broken,36,1);self.path.write_bytes(broken)
        with self.assertRaisesRegex(ValueError,'offset'):Archive(self.path)
    def test_hrc_hierarchy_and_untrusted_names(self):
        self.assertEqual(parse_hrc(files()['test.hrc'])['bones'][0]['parent'],-1)
        with self.assertRaisesRegex(ValueError,'hierarchy'):parse_hrc(files()['test.hrc'].replace(b'root',b'missing'))
        with self.assertRaisesRegex(ValueError,'Unsafe'):parse_hrc(files()['test.hrc'].replace(b'1 part',b'1 ../part'))
    def test_p_geometry_uv_and_bad_references(self):
        group=parse_p(mesh())['groups'][0];self.assertEqual(group['positions'][:3],[-1,-1,0]);self.assertEqual(len(group['uv']),6)
        broken=bytearray(mesh());struct.pack_into('<H',broken,128+36+24+12+4+2,8)
        with self.assertRaisesRegex(ValueError,'reference'):parse_p(broken)
    def test_tex_alpha_key_and_nearest_repeat(self):
        tex=decode_tex(texture());self.assertEqual(list(tex.rgba),[255,255,255,128,255,0,0,255]);self.assertEqual(texel(tex,1.75,0),bytes([255,0,0,255]))
        self.assertEqual(texel(tex,-.25,0),texel(tex,.75,0))
        with self.assertRaises(ValueError):decode_tex(texture()[:-1])
    def test_animation_requires_matching_bones_and_finite_values(self):
        with self.assertRaisesRegex(ValueError,'counts'):parse_animation(animation(),2)
        bad=bytearray(animation());struct.pack_into('<f',bad,36,float('nan'))
        with self.assertRaisesRegex(ValueError,'finite'):parse_animation(bad)
    def test_source_parent_endpoint_and_basis(self):
        model={'skeleton':{'bones':[{'name':'root-bone','parent':-1,'length':4},{'name':'child','parent':0,'length':2}]},'animation':parse_animation(animation(2))}
        point=transform(pose(model)[1],[0,0,0]);self.assertAlmostEqual(point[2],-4);self.assertAlmostEqual(point[1],0)
    def test_png_is_deterministic_transparent_and_preserves_source_gray(self):
        model=load_model(dict(resourceId='test.hrc',animation='idle.a'),self.archive)
        image,meta=render(model,width=64,height=80);self.assertEqual(image[:8],b'\x89PNG\r\n\x1a\n');self.assertEqual(struct.unpack_from('>II',image,16),(64,80))
        self.assertGreater(meta['visible_pixels'],0);self.assertLess(meta['visible_pixels'],64*80);self.assertEqual(render(model,width=64,height=80)[0],image)
        import zlib
        pos=8;data=b''
        while pos<len(image):
            size=struct.unpack_from('>I',image,pos)[0]
            if image[pos+4:pos+8]==b'IDAT':data+=image[pos+8:pos+8+size]
            pos+=size+12
        raw=zlib.decompress(data);visible=[raw[y*257+1+x*4:y*257+1+x*4+4] for y in range(80) for x in range(64) if raw[y*257+1+x*4+3]]
        self.assertTrue(visible);self.assertTrue(all(v==bytes([128,128,128,128]) for v in visible))
    def test_battle_signed_lengths_are_distinct_from_hrc(self):
        h=[0]*13;h[3]=1;data=struct.pack('<13I',*h)+struct.pack('<ifi',-1,-39,1)
        self.assertEqual(parse_battle_skeleton(data)['bones'][0]['length'],-39)
        with self.assertRaises(ValueError):parse_battle_skeleton(files()['test.hrc'])
    def test_card_art_camera_and_light_are_separate_from_technical_preview(self):
        model=load_model(dict(resourceId='test.hrc',animation='idle.a'),self.archive)
        technical,old=render(model,width=64,height=80)
        art=dict(yaw=145,elevation=-8,roll=-9,zoom=1.5,fit='height',focusBone='body',anchor=[.5,.35])
        candidate,meta=render(model,width=64,height=80,art=art)
        self.assertNotEqual(technical,candidate);self.assertEqual(meta['purpose'],'card-art-candidate');self.assertEqual(old['purpose'],'technical-preview-only')
        self.assertEqual(meta['lighting'],'card-key-fill-v1');self.assertGreater(meta['visible_pixels'],0)
        self.assertEqual(model['skeleton']['bones'][0]['length'],2)
    def test_invalid_art_pose_is_a_clear_error_not_a_fabricated_frame(self):
        model=load_model(dict(resourceId='test.hrc',animation='idle.a'),self.archive)
        with self.assertRaisesRegex(ValueError,'missing bone'):render(model,art={'poseAdjustments':{'nonexistent':[0,0,0]}})
        with self.assertRaisesRegex(ValueError,'configuration'):render(model,art={'zoom':float('nan')})
    def test_discovery_is_bounded_and_output_is_confined(self):
        with self.assertRaisesRegex(ValueError,'Generated output'):discover(self.path,{})
        nested=self.folder/'elsewhere'/'field';nested.mkdir(parents=True);(nested/'char.lgp').write_bytes(self.path.read_bytes());self.path.unlink()
        with self.assertRaisesRegex(ValueError,'No supported'):discover(self.folder,{})
        with self.assertRaisesRegex(ValueError,'Outputs'):output_path(ROOT/'site/leak.png')
    def test_cli_build_is_read_only_and_failures_name_resources(self):
        # Input fixtures deliberately outside private-assets, still inside project.
        with tempfile.TemporaryDirectory(dir=ROOT/'tests',prefix='asset-input-') as directory:
            source=Path(directory)/'char.lgp';source.write_bytes(self.path.read_bytes());before=hashlib.sha256(source.read_bytes()).hexdigest()
            spec=dict(id='synthetic',kind='field',resourceId='test.hrc',animation='idle.a',frame=0,cardIds=[])
            recipe=self.folder/'recipe.json';recipe.write_text(json.dumps(dict(version=1,models=[spec])))
            command=[sys.executable,str(ROOT/'tools/assets.py'),'build','--source',str(source),'--manifest',str(recipe),'--out',str(self.folder/'pack')]
            result=subprocess.run(command,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before)
            report=json.loads((self.folder/'pack/build-report.json').read_text());self.assertEqual(report['models'][0]['skeletonName'],'synthetic_triangle')
            spec['animation']='missing.a';recipe.write_text(json.dumps(dict(version=1,models=[spec])))
            failed=subprocess.run(command,capture_output=True,text=True);self.assertEqual(failed.returncode,1);self.assertIn('missing.a',failed.stdout)

if __name__=='__main__':unittest.main(verbosity=2)
