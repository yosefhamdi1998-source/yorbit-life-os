@echo off
REM Double-click to refresh all 5 backup documents (status report, what-to-
REM do-next, conversation history, source zip, source folder) in both
REM iCloud and your Desktop's Yorbit Backup folder — regenerated from the
REM live project, not a copy of whatever day they were last built by hand.

setlocal

REM Derive the project folder from where this .bat actually lives (it sits
REM in <project>\scripts\), so this keeps working on a machine whose
REM Windows user folder isn't "Yosef". Falls back to the old hardcoded path
REM if the .bat has been copied somewhere else, e.g. onto the Desktop.
for %%I in ("%~dp0..") do set "PROJECT=%%~fI"
if not exist "%PROJECT%\scripts\update-backup-docs.sh" set "PROJECT=C:\Users\Yosef\projects\yorbit-life-os"

if not exist "%PROJECT%\scripts\update-backup-docs.sh" (
  echo.
  echo Could not find the Yorbit project.
  echo Looked in: %PROJECT%
  echo.
  echo If the project lives somewhere else, keep this .bat inside the
  echo project's scripts\ folder and it will find itself.
  echo.
  pause
  exit /b 1
)

REM Git for Windows installs to one of these three places. The third is the
REM per-user install, which is what you get without admin rights.
set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=C:\Program Files (x86)\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"

if not exist "%BASH%" (
  echo.
  echo Could not find Git Bash. Looked for:
  echo   C:\Program Files\Git\bin\bash.exe
  echo   C:\Program Files ^(x86^)\Git\bin\bash.exe
  echo   %%LOCALAPPDATA%%\Programs\Git\bin\bash.exe
  echo.
  echo Tell Claude this message and it will sort it out.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Update backup documents
echo ============================================
echo.
echo Regenerating the status report, the to-do list, your
echo conversation history, and the app's source code, then
echo writing all five into both iCloud and your Desktop's
echo Yorbit Backup folder.
echo.
echo This talks to Supabase-adjacent tools and reads a large
echo session log, so it can take a minute. That is normal.
echo.

cd /d "%PROJECT%"
if errorlevel 1 (
  echo Could not enter the project folder: %PROJECT%
  pause
  exit /b 1
)

"%BASH%" -lc "./scripts/update-backup-docs.sh"
set "RC=%ERRORLEVEL%"

echo.
echo ============================================
if not "%RC%"=="0" (
  echo   UPDATE FAILED - exit code %RC%
  echo ============================================
  echo.
  echo Nothing was changed in iCloud or your Desktop folder.
  echo Read the messages above for which file failed and why.
  echo.
  pause
  exit /b %RC%
)
echo   Done. Both folders are up to date.
echo ============================================
echo.
pause
