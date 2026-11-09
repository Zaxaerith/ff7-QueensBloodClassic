"""Read the same private path configuration as the Node tools. Never writes."""
import json
import os
import re
from pathlib import Path


def read_local_paths(root, explicit=None):
    selected=explicit or os.environ.get('QB_LOCAL_PATHS')
    file=(Path(root)/(selected or 'qb.local.json')).resolve()
    if not file.is_file():
        if selected:raise ValueError(f'Local paths file not found: {file}')
        return dict(version=1,sources={},artPacks={})
    value=json.loads(file.read_text(encoding='utf-8'))
    if not isinstance(value,dict) or type(value.get('version')) is not int or value.get('version')!=1:raise ValueError('Unsupported local paths version')
    result=dict(version=1)
    for section in ['sources','artPacks']:
        rows=value.get(section,{})
        if not isinstance(rows,dict):raise ValueError('Local path entries must be an object')
        result[section]={}
        for key,path in rows.items():
            if not re.fullmatch(r'[a-z][a-z0-9-]*',key) or not isinstance(path,str) or not path.strip():raise ValueError(f'Invalid local path entry: {key}')
            if section=='sources' and key not in ('game','field','world','battle','menu','bindings'):raise ValueError(f'Invalid local source: {key}')
            result[section][key]=str((file.parent/path).resolve())
    return result
