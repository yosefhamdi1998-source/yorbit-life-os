@echo off
REM Double-click to refresh your saved conversation history.
REM Finds the NEWEST Claude Code session automatically, writes a readable
REM transcript, and drops an identical copy in both backup folders.
REM
REM Run this at the end of any working session and your Desktop + iCloud
REM copies are current again.

setlocal enabledelayedexpansion

for %%I in ("%~dp0..") do set "PROJECT=%%~fI"
if not exist "%PROJECT%\scripts\export-session.js" set "PROJECT=C:\Users\Yosef\projects\yorbit-life-os"

set "LOGDIR=C:\Users\Yosef\.claude\projects\C--Users-Yosef"
set "ICLOUD=C:\Users\Yosef\iCloudDrive\YORBIT"
set "DESKTOP=C:\Users\Yosef\OneDrive\Desktop\Yorbit Backup"
set "OUTNAME=3 - Full Conversation History.md"

REM The old version hardcoded one session's UUID, so it kept re-exporting the
REM same conversation no matter how much newer work had happened. Pick the
REM most recently modified log instead.
set "SESSION="
for /f "delims=" %%F in ('dir /b /a-d /o-d "%LOGDIR%\*.jsonl" 2^>nul') do (
  set "SESSION=%LOGDIR%\%%F"
  goto :gotsession
)
:gotsession

if not defined SESSION (
  echo.
  echo Could not find any Claude Code session log in:
  echo   %LOGDIR%
  echo.
  echo Tell Claude this message.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Update conversation history
echo ============================================
echo.
echo Newest session log:
echo   %SESSION%
echo.
echo Reading it and writing a readable transcript.
echo The raw log is large, so this takes a few seconds.
echo.

cd /d "%PROJECT%"
if errorlevel 1 (
  echo Could not enter the project folder: %PROJECT%
  pause
  exit /b 1
)

if not exist "%ICLOUD%" mkdir "%ICLOUD%"
if not exist "%DESKTOP%" mkdir "%DESKTOP%"

node "scripts\export-session.js" "%SESSION%" "%ICLOUD%\%OUTNAME%"
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo ============================================
  echo   EXPORT FAILED - exit code %RC%
  echo ============================================
  echo.
  echo Your saved history was NOT updated. Read above for the reason.
  echo.
  pause
  exit /b %RC%
)

echo.
echo Copying the same file to your Desktop folder...
copy /Y "%ICLOUD%\%OUTNAME%" "%DESKTOP%\%OUTNAME%" >nul
if errorlevel 1 (
  echo   Desktop copy FAILED - the iCloud copy is still good.
) else (
  echo   Desktop copy done.
)

REM Deliberately NOT copying the raw .jsonl any more. It is ~100 MB, it is
REM UNREDACTED (the export is the redacted one), and a folder of these was
REM already deleted once to reclaim iCloud space.

echo.
echo ============================================
echo   Updated in both places:
echo   %ICLOUD%
echo   %DESKTOP%
echo ============================================
echo.
echo Note: this refreshes the conversation history only.
echo The two PDFs and the source-code zip are built by Claude
echo on request - ask for those whenever you want them current.
echo.
pause
