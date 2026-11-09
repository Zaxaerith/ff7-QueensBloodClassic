"""Production-only adapters. No research entry point, private recipe or font.

Instance placement follows tools/batch11_sources.py's uniform rigid transform;
decoding, motion, geometry, textures and layers use the existing Art modules.
SPDX-License-Identifier: GPL-3.0-only
"""
import hashlib
import importlib
import json
from assets import load_model
from ff7_assets.battle_model import load_battle, assemble
from ff7_assets.battle_render import render_scene
from ff7_assets.battle_composite import layers
from ff7_assets.render import pose, multiply, translation, rotation, transform, identity


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def native(source, archives):
    kind = source['kind']
    a = archives.get(kind)
    if kind == 'battle' and source.get('components'):
        # Same-origin assembly from the existing Batch05 producer. No offsets,
        # guessed sockets or entity rescaling of the separate source skeletons.
        models = [load_battle(a, resource) for resource in source['components']]
        if not models or any(m['textures'] or m['weapon'] for m in models):
            raise ValueError('Unsupported textured/weapon multi-skeleton assembly')
        frame_counts = [[len(c['frames']) for c in m['pack']['body']] for m in models]
        if any(counts != frame_counts[0] for counts in frame_counts):
            raise ValueError('Native component motion counts disagree')
        scene, poses = [], []
        for m in models:
            parts, frame = assemble(m, source['pose'])
            scene.extend(dict(component=m['skeletonId'], **part) for part in parts)
            poses.append(dict(skeleton=m['skeletonId'], **frame))
        if any(p['bodyMatrices'][0] != poses[0]['bodyMatrices'][0] for p in poses):
            raise ValueError('Native component origins disagree; never auto-repair')
        return scene, {}, dict(source=source, componentPoses=poses, parts=len(scene), textures=0,
                               archiveSha256=a.sha256, assembly='native-common-origin', componentOffsetsApplied=False,
                               geometrySha256=canonical_hash([dict(resourceId=p['resourceId'], geometry=p['geometry']) for p in scene]))
    elif kind == 'battle':
        model = load_battle(a, source['resource'], source.get('weapon'))
        scene, frame = assemble(model, source['pose'])
    elif kind == 'magic':
        from ff7_assets.magic_model import load_magic, assemble_magic
        model = load_magic(a, source['resource'])
        scene, frame = assemble_magic(model, source['pose'])
    else:
        spec = dict(resourceId=source['resource'], animation=source['animation'])
        if source.get('field'):
            spec['bindingField'] = source['field']
        model = load_model(spec, a, archives.get('bindings') if source.get('field') else None)
        matrices = pose(model, source['pose']['frame'])
        scene = [dict(resourceId=p['resource'], bone=p['bone'], matrix=matrices[p['bone']],
                      geometry=dict(p['geometry'], texture=p['texture'])) for p in model['parts']]
        frame = dict(bodyMatrices=matrices, animationId=source['animation'], binding=model['binding'])
    evidence = dict(source=source, frame=frame, parts=len(scene), textures=len(model['textures']),
                    meshes=model.get('meshes', []), weapon=source.get('weapon'),
                    archiveSha256=a.sha256,
                    geometrySha256=canonical_hash([dict(resourceId=p['resourceId'], geometry=p['geometry']) for p in scene]))
    return scene, model['textures'], evidence


def instance(scene, textures, placement, prefix):
    # Preserve the source algorithm's rotation order, anchor and texture lookup.
    view = rotation(placement.get('rotation', [0, 0, 0]), [1, 0, 2])
    pts = []
    for p in scene:
        g = p['geometry']; matrix = multiply(view, p['matrix'])
        pts.extend(transform(matrix, g['positions'][i:i+3]) for i in range(0, len(g['positions']), 3))
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    scale = placement['height'] / (hi[1] - lo[1]); sm = identity()
    for i in range(3):
        sm[i][i] = scale
    anchor = [(lo[0]+hi[0])/2, lo[1], (lo[2]+hi[2])/2]
    matrix = multiply(translation(*placement['position']), multiply(sm, multiply(translation(*[-v for v in anchor]), view)))
    result = [dict(p, matrix=multiply(matrix, p['matrix']), geometry=dict(p['geometry'],
                   texture=None if p['geometry']['texture'] is None else prefix+str(p['geometry']['texture']))) for p in scene]
    return result, {prefix+str(k): v for k, v in textures.items()}, dict(
        wholeEntityMatrix=matrix, uniformScale=scale, sourceLocalTransformsChanged=False)


def authored(card_id, name):
    from ff7_assets.original_ps1 import compile_recipe, assemble_original
    for module_name in ('batch10_models', 'batch11_models', 'batch12_models', 'batch13_models', 'batch14_models'):
        module = importlib.import_module(module_name)
        if card_id in module.BUILDERS:
            recipe = module.make_recipe(card_id) if hasattr(module, 'make_recipe') else module.BUILDERS[card_id]()
            break
    else:
        from batch11_models import props
        recipe = props(card_id, name)
        if not recipe['parts']:
            raise ValueError(f'UNSUPPORTED_AUTHORED_BUILDER: {card_id}')
    if recipe['cardId'] != card_id or recipe['name'] != name:
        raise ValueError('Authored builder identity differs from approved recipe')
    model = compile_recipe(recipe)
    scene, frame = assemble_original(model)
    return scene, model['textures'], dict(sourceKind='fan-original', ogMeshImports=0,
        ogTextureImports=0, recipeSha256=canonical_hash(recipe), frame=frame, parts=len(scene))


def produce(spec, sources, folder, resolution, cancel):
    scene, textures, evidence = [], {}, []
    if 'instances' in spec:
        for i, item in enumerate(spec['instances']):
            cancel()
            parts, tex, record = native(item['source'], sources)
            parts, tex, placement = instance(parts, tex, item['placement'], f'instance-{i}:')
            scene.extend(parts); textures.update(tex)
            evidence.append(dict(record, placement=placement, label=item['label']))
        if spec.get('fanProvenance') == 'FAN_ORIGINAL':
            parts, tex, record = authored(spec['cardId'], spec['name'])
            scene.extend(dict(p, geometry=dict(p['geometry'], texture=None if p['geometry']['texture'] is None else 'fan:'+str(p['geometry']['texture']))) for p in parts)
            textures.update({'fan:'+str(k): v for k, v in tex.items()}); evidence.append(record)
    elif spec['kind'] == 'original':
        scene, textures, record = authored(spec['cardId'], spec['name']); evidence.append(record)
    else:
        source = dict(kind=spec['kind'], resource=spec['skeleton'], pose=spec['pose'])
        for key, dest in [('weapon', 'weapon'), ('animation', 'animation'), ('bindingField', 'field'), ('components', 'components')]:
            if spec.get(key):
                source[dest] = spec[key]
        scene, textures, record = native(source, sources); evidence.append(record)
    cancel()
    png, metadata = render_scene(scene, textures, spec['camera'], resolution, resolution)
    (folder/'subject.png').write_bytes(png)
    if spec.get('exportFullSubject'):
        camera = {k: v for k, v in spec['camera'].items() if k not in ('center', 'unitsPerFrame')}
        png, _ = render_scene(scene, textures, camera, resolution, resolution)
        (folder/'subject-full.png').write_bytes(png)
    cancel()
    layers(spec, folder, resolution)
    return dict(cardId=spec['cardId'], kind=spec['kind'], recipeSha256=canonical_hash(spec),
                render=metadata, sources=evidence, usedArchives=sources.used())
