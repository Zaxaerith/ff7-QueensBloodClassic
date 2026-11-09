"""Console-subsystem frozen worker, never imports the GUI. GPL-3.0-only."""
import sys
from pathlib import Path
import runpy
import os
import threading
import ctypes

if __name__ == '__main__':
    if getattr(sys,'frozen',False) and os.environ.get('QB_GENERATOR_PARENT_PID'):
        def watch_parent():
            kernel=ctypes.windll.kernel32
            kernel.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32]
            kernel.OpenProcess.restype=ctypes.c_void_p
            kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32]
            kernel.CloseHandle.argtypes=[ctypes.c_void_p]
            handle=kernel.OpenProcess(0x100000,False,int(os.environ['QB_GENERATOR_PARENT_PID']))
            if not handle:return
            try:
                kernel.WaitForSingleObject(handle,0xffffffff)
                if '--cancel-file' in sys.argv:
                    Path(sys.argv[sys.argv.index('--cancel-file')+1]).touch(exist_ok=True)
                    # Allow the existing producer to checkpoint cancellation.
                    import time
                    time.sleep(30)
                os._exit(130)
            finally:kernel.CloseHandle(handle)
        threading.Thread(target=watch_parent,daemon=True).start()
    root=Path(sys._MEIPASS)/'producer' if getattr(sys,'frozen',False) else Path(__file__).resolve().parent.parent
    entry=root/'tools/qb-assets.py'
    sys.path.insert(0,str(entry.parent))
    sys.argv[0]=str(entry)
    runpy.run_path(str(entry),run_name='__main__')
