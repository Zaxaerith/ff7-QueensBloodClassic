"""Bounded English Steam installation preflight. Never writes source archives.
SPDX-License-Identifier: GPL-3.0-only
"""
from pathlib import Path
from assets import Archive, descend

LAYOUTS = {
    'battle': [('battle', 'battle.lgp')],
    'magic': [('battle', 'magic.lgp'), ('magic', 'magic.lgp')],
    'field': [('field', 'char.lgp')],
    'bindings': [('field', 'flevel.lgp')],
    'world': [('wm', 'world_us.lgp')],
}
ROOTS = [(), ('data',), ('workingdir', 'data'), ('ff7', 'workingdir', 'data')]
INSPECT_ANCHORS = {
    'battle': ['ebaa', 'ebda', 'rtaa', 'rtda', 'rtck'],
    'magic': ['ifreetda.d', 'ifreetda.a00'],
    'field': ['gajc.hrc', 'gbhc.a', 'gpcd.hrc', 'gpib.a'],
    'bindings': ['gldst', 'crcin_2'],
    'world': ['aja.hrc', 'asc.a'],
}


class ContextArchive(Archive):
    """Add error context only; all archive/format validation stays in Archive."""
    last_resource = None

    def read(self, name):
        self.last_resource = name
        return super().read(name)


def locate(source):
    selected = Path(source).resolve(strict=True)
    if not selected.is_dir():
        raise ValueError(f'SOURCE_NOT_DIRECTORY: select the FF7 installation directory: {selected}')
    rows = {}
    for role, suffixes in LAYOUTS.items():
        candidates = set()
        for prefix in ROOTS:
            for suffix in suffixes:
                path = descend(selected, prefix + suffix)
                if path is not None and path.is_file():
                    resolved = path.resolve(strict=True)
                    if not resolved.is_relative_to(selected):
                        raise ValueError(f'SOURCE_ESCAPES_INSTALL: {path}')
                    candidates.add(resolved)
        rows[role] = dict(candidates=sorted(str(p) for p in candidates),
                          expected=[str(selected.joinpath(*prefix, *suffix))
                                    for prefix in ROOTS for suffix in suffixes])
    return selected, rows


class Sources:
    def __init__(self, source):
        self.root, self.paths = locate(source)
        self.archives = {}
        self.errors = {}

    def get(self, role):
        if role in self.errors:
            raise ValueError(self.errors[role])
        if role in self.archives:
            return self.archives[role]
        paths = self.paths[role]['candidates']
        try:
            if not paths:
                raise ValueError(f'MISSING_ARCHIVE: {role}; expected {self.paths[role]["expected"][1]} (or another listed known layout)')
            if len(paths) != 1:
                raise ValueError(f'AMBIGUOUS_ARCHIVE: {role}: {paths}')
            self.archives[role] = ContextArchive(Path(paths[0]))
            return self.archives[role]
        except (ValueError, OSError) as error:
            self.errors[role] = str(error)
            raise

    def inspect(self, required=None, entries=None):
        required = set(LAYOUTS) if required is None else set(required)
        entries = INSPECT_ANCHORS if entries is None else entries
        rows = []
        for role in LAYOUTS:
            row = dict(role=role, required=role in required, **self.paths[role])
            if role not in required:
                row.update(status='not-required', reason='Selected cards do not use this archive; not opened')
            else:
                try:
                    a = self.get(role)
                    missing = [n for n in entries.get(role, []) if len(a.entries.get(n.lower(), [])) != 1]
                    row.update(path=str(a.path), sha256=a.sha256, size=a.path.stat().st_size,
                               entryCount=a.inventory['entry_count'], status='missing-entries' if missing else 'validated',
                               missingEntries=missing)
                except (ValueError, OSError) as error:
                    row.update(status='missing' if not row['candidates'] else 'unparseable' if len(row['candidates']) == 1 else 'ambiguous',
                               reason=str(error))
            rows.append(row)
        layout = 'known-english-resource-layout' if any(r['candidates'] for r in rows) else 'unsupported-layout'
        return dict(schema='qb-source-inspection', version=1, source=str(self.root), readOnly=True,
                    scope='Steam FF7 Original PC / English resource filenames; not ownership verification',
                    layout=layout, archives=rows,
                    ok=all(r['status'] in ('validated', 'not-required') for r in rows))

    def used(self):
        return {role: dict(path=str(a.path), sha256=a.sha256, resources=a.used)
                for role, a in self.archives.items() if a.used}

    def context(self):
        return {role: dict(path=str(a.path), resource=a.last_resource)
                for role, a in self.archives.items() if a.last_resource}


def requirements(spec):
    """Explicit minimum roots; the shared readers validate all dependent parts."""
    result = {}
    sources = [i['source'] for i in spec.get('instances', [])]
    if 'instances' not in spec and spec['kind'] != 'original':
        sources = [dict(kind=spec['kind'], resource=spec['skeleton'],
                        animation=spec.get('animation'), field=spec.get('bindingField'), weapon=spec.get('weapon'),
                        components=spec.get('components'))]
    for s in sources:
        role = s['kind']
        result.setdefault(role, []).extend(s.get('components') or [s['resource']])
        if s.get('animation'):
            result[role].append(s['animation'])
        if s.get('weapon'):
            result[role].append(s['weapon'])
        if role == 'battle':
            result[role].extend(resource[:2]+'da' for resource in (s.get('components') or [s['resource']]))
        if role == 'magic':
            result[role].append(s['resource'][:-2] + '.a00')
        if s.get('field'):
            result.setdefault('bindings', []).append(s['field'])
    return {role: sorted(set(names)) for role, names in result.items()}
