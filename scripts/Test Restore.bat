@echo off
REM Double-click to prove the newest backup can actually be RESTORED.
REM Rebuilds every table into a throwaway "restore_test" schema and checks
REM the row counts match the backup exactly. Your real data is not touched.

setlocal

for %%I in ("%~dp0..") do set "PROJECT=%%~fI"
if not exist "%PROJECT%\scripts\restore.sh" set "PROJECT=C:\Users\Yosef\projects\yorbit-life-os"

set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=C:\Program Files (x86)\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"

if not exist "%BASH%" (
  echo.
  echo Could not find Git Bash. Tell Claude this message.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Test-restore Yorbit backup
echo ============================================
echo.
echo This rebuilds your newest backup into a throwaway
echo schema and checks every table row-for-row.
echo.
echo Your real data is NOT touched.
echo.
echo You will be asked for your backup password.
echo.
echo This talks to Supabase once per 1500 rows, so it
echo takes a few minutes and scrolls a lot. That is normal.
echo.

cd /d "%PROJECT%"
if errorlevel 1 (
  echo Could not enter the project folder: %PROJECT%
  pause
  exit /b 1
)

"%BASH%" -lc "./scripts/restore.sh '/c/Users/Yosef/iCloudDrive/Yorbit Backups'"
set "RC=%ERRORLEVEL%"

echo.
echo ============================================
if not "%RC%"=="0" (
  echo   RESTORE TEST FAILED - exit code %RC%
  echo ============================================
  echo.
  echo Your backup could not be fully restored. Read above
  echo for the reason. Do not trust this backup until it passes.
  echo.
  pause
  exit /b %RC%
)
echo   Restore test PASSED.
echo ============================================
echo.
echo Look above for: "Every table matches the backup row-for-row"
echo followed by a real row count.
echo.
echo Cleanup - drop the throwaway schema when you are done:
echo   drop schema restore_test cascade;
echo.
pause
