"""Portable/source layout and stable Windows user data. GPL-3.0-only."""
from pathlib import Path
import sys
import ctypes
import uuid
import json

def resource_root():
    return Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent.parent

def _known_folder(identifier):
    # KF_FLAG_NO_PACKAGE_REDIRECTION: same folder under Explorer and MSIX hosts.
    guid=(ctypes.c_ubyte*16).from_buffer_copy(uuid.UUID(identifier).bytes_le)
    value=ctypes.c_void_p()
    api=ctypes.windll.shell32.SHGetKnownFolderPath
    api.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_void_p,ctypes.POINTER(ctypes.c_void_p)]
    result=api(ctypes.byref(guid),0x10000,None,ctypes.byref(value))
    if result: raise OSError('Cannot resolve Windows LocalAppData without package redirection')
    try: path=Path(ctypes.wstring_at(value))/'QueensBloodClassicDesktop'
    finally: ctypes.windll.ole32.CoTaskMemFree(value)
    return path

def user_data():
    # LocalAppData I/O is virtualized even with NO_PACKAGE_REDIRECTION under
    # MSIX. Saved Games is a stable user-owned anchor, not the program folder.
    anchor=_known_folder('4c5c32ff-bb9d-43b0-b5b4-2d72e54eaaa4')
    anchor.mkdir(parents=True,exist_ok=True)
    pointer=anchor/'data-location.json'
    if pointer.exists():
        row=json.loads(pointer.read_text('utf-8'))
        if row.get('version')!=1 or not isinstance(row.get('path'),str) or not Path(row['path']).is_absolute():
            raise ValueError('Invalid Saved Games data-location.json; existing data has not been changed')
        return Path(row['path'])
    legacy=_known_folder('f1b32785-6fba-4fcf-9d55-7b8e7f157091').resolve()
    target=anchor/'data'
    if (legacy/'desktop-settings.json').exists() or (legacy/'webview2').exists():
        choice=ctypes.windll.user32.MessageBoxW(None,'检测到旧版桌面数据。是否继续使用以下原目录？\n'+str(legacy)+'\nYes: 保留原数据；No: 新建独立数据（不删除旧数据）；Cancel: 退出。','Queen\'s Blood Classic · Data location',0x23)
        if choice==2:raise ValueError('Data location selection cancelled; existing data preserved')
        if choice==6:target=legacy
    temporary=pointer.with_suffix('.tmp')
    temporary.write_text(json.dumps({'version':1,'path':str(target.resolve())},ensure_ascii=False),'utf-8');temporary.replace(pointer)
    return target
