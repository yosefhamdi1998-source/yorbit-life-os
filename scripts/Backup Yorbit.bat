@echo off
REM Double-click this to back up the Yorbit database.
REM It finds Git Bash, runs scripts/backup.sh, and keeps the window
REM open afterwards so the result can actually be read.

setlocal

REM Derive the project folder from where this .bat actually lives (it sits in
REM <project>\scripts\), so this keeps working on a machine whose Windows user
REM folder isn't "Yosef". Falls back to the old hardcoded path if the .bat has
REM been copied somewhere else, e.g. onto the Desktop.
for %%I in ("%~dp0..") do set "PROJECT=%%~fI"
if not exist "%PROJECT%\scripts\backup.sh" set "PROJECT=C:\Users\Yosef\projects\yorbit-life-os"

if not exist "%PROJECT%\scripts\backup.sh" (
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
  echo Could not find Git Bash in the usual places.
  echo Looked for:
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
echo   Yorbit backup
echo ============================================
echo.
echo This will take a snapshot of your database and
echo encrypt it with a password you choose.
echo.
echo You will be asked for the password TWICE.
echo Nothing appears on screen while you type it -
echo that is normal, keep typing and press Enter.
echo.

REM Two directories on purpose:
REM   1st = local staging. The plaintext snapshot (every transaction plus
REM         password hashes) is written here before encryption, so it must
REM         NOT be a synced folder - OneDrive/iCloud would happily upload
REM         the readable copy in the seconds before it's deleted.
REM   2nd = iCloud Drive, which receives ONLY the finished encrypted file.
cd /d "%PROJECT%"
if errorlevel 1 (
  echo.
  echo Could not enter the project folder: %PROJECT%
  echo.
  pause
  exit /b 1
)

"%BASH%" -lc "./scripts/backup.sh /c/Users/Yosef/yorbit-backups '/c/Users/Yosef/iCloudDrive/Yorbit Backups'"
set "RC=%ERRORLEVEL%"

echo.
echo ============================================
if not "%RC%"=="0" (
  echo   BACKUP FAILED - exit code %RC%
  echo ============================================
  echo.
  echo NO NEW BACKUP WAS CREATED. Read the messages above for the reason.
  echo Do not assume your data is backed up until this says Finished.
  echo.
  pause
  exit /b %RC%
)
echo   Finished. Read the message above.
echo ============================================
echo.
pause
