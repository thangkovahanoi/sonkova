@echo off
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del /Q "%STARTUP%\KHO-XPRINTER-V5-AUTO-START.vbs" 2>nul
if exist "%STARTUP%\KHO-XPRINTER-V5-AUTO-START.vbs" (
  echo [LOI] Khong the xoa muc tu dong khoi dong.
) else (
  echo DA TAT TU DONG KHOI DONG KHO XPRINTER V5.
)
pause
endlocal
