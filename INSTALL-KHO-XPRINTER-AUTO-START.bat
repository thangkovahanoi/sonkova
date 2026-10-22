@echo off
setlocal
set "ROOT=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%STARTUP%" mkdir "%STARTUP%"
copy /Y "%ROOT%KHO-XPRINTER-V5-AUTO-START.vbs" "%STARTUP%KHO-XPRINTER-V5-AUTO-START.vbs" >nul
if errorlevel 1 (
  echo [LOI] Khong the cai tu dong khoi dong.
  pause
  exit /b 1
)
echo.
echo DA BAT TU DONG KHOI DONG KHO XPRINTER V5 KHI MO WINDOWS.
echo.
echo Vi tri: %STARTUP%\KHO-XPRINTER-V5-AUTO-START.vbs
echo.
echo Tu lan sau, Windows se tu dong mo KHO XPRINTER V5.
echo Nhan phim bat ky de dong.
pause >nul
endlocal
