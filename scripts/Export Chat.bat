@echo off
REM Double-click to save this whole Claude session to iCloud.
REM Produces a readable Markdown transcript plus a copy of the raw log.

setlocal

set "PROJECT=C:\Users\Yosef\projects\yorbit-life-os"
set "SESSION=C:\Users\Yosef\.claude\projects\C--Users-Yosef\600c2490-ad58-4b20-a0da-157a5ae3e07f.jsonl"
set "DEST=C:\Users\Yosef\iCloudDrive\Yorbit Session Logs"

set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=C:\Program Files (x86)\Git\bin\bash.exe"

if not exist "%SESSION%" (
  echo.
  echo Could not find the session log at:
  echo   %SESSION%
  echo.
  echo Tell Claude this message.
  echo.
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"

echo.
echo ============================================
echo   Export chat to iCloud
echo ============================================
echo.
echo Reading the session log and writing a readable
echo transcript. The raw log is about 100 MB, so this
echo takes a few seconds.
echo.

cd /d "%PROJECT%"
node "scripts\export-session.js" "%SESSION%" "%DEST%\yorbit-session-2026-09-04.md"

echo.
echo Copying the raw log too (nothing summarized, in case
echo you ever want the complete record)...
copy /Y "%SESSION%" "%DEST%\yorbit-session-2026-09-04-raw.jsonl" >nul
if errorlevel 1 (
  echo   raw copy FAILED
) else (
  echo   raw copy done
)

echo.
echo ============================================
echo   Saved to:
echo   %DEST%
echo ============================================
echo.
pause
