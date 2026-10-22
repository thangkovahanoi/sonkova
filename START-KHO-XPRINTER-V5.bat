@echo off
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"

echo ================================================
echo   KHO XPRINTER V5 - START
echo ================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Hay cai Node.js roi chay lai.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [LOI] Khong tim thay npm.
  pause
  exit /b 1
)
where dotnet >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai .NET SDK/Runtime phu hop cho Print Bridge.
  pause
  exit /b 1
)

if not exist "%ROOT%web\package.json" (
  echo [LOI] Khong tim thay thu muc web.
  pause
  exit /b 1
)
if not exist "%ROOT%windows-print-bridge\WindowsPrintBridge.csproj" (
  echo [LOI] Khong tim thay Windows Print Bridge.
  pause
  exit /b 1
)

REM Install frontend dependencies automatically on first run.
if not exist "%ROOT%web\node_modules\vite\package.json" (
  echo [CHU Y] Chua co node_modules. Dang chay npm install lan dau...
  cd /d "%ROOT%web"
  call npm install
  if errorlevel 1 (
    echo [LOI] npm install that bai. Hay kiem tra Internet va chay lai.
    pause
    exit /b 1
  )
  cd /d "%ROOT%"
)

REM Start Windows Print Bridge if port 9100 is not already in use.
netstat -ano | findstr /R /C:":9100 .*LISTENING" >nul
if errorlevel 1 (
  echo [1/2] Dang khoi dong Windows Print Bridge...
  start "KHO XPRINTER - Print Bridge" cmd /k "cd /d "%ROOT%windows-print-bridge" && dotnet run --project WindowsPrintBridge.csproj"
) else (
  echo [1/2] Print Bridge dang chay tren cong 9100.
)

REM Start Vite if port 5173 is not already in use.
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo [2/2] Dang khoi dong giao dien KHO XPRINTER V5...
  start "KHO XPRINTER - Web" cmd /k "cd /d "%ROOT%web" && npm run dev -- --host 127.0.0.1"
) else (
  echo [2/2] Giao dien dang chay tren cong 5173.
)

echo.
echo Dang cho Vite khoi dong...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo KHO XPRINTER V5 da duoc khoi dong.
echo Trinh duyet: http://localhost:5173
echo Print Bridge: http://127.0.0.1:9100
endlocal
exit /b 0
