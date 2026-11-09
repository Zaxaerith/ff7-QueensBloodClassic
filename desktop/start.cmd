@echo off
setlocal
if defined QB_DESKTOP_PYTHON (
  start "" "%QB_DESKTOP_PYTHON%" "%~dp0run.py" %*
) else if exist "%~dp0.venv\Scripts\pythonw.exe" (
  start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0run.py" %*
) else (
  echo Create desktop\.venv and install desktop\requirements.txt first.
  echo See desktop\README.md. Or set QB_DESKTOP_PYTHON to your prepared python.exe.
  pause
  exit /b 1
)
