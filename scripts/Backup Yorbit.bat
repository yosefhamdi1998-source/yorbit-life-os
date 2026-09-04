@echo off
REM Double-click this to back up the Yorbit database.
REM It finds Git Bash, runs scripts/backup.sh, and keeps the window
REM open afterwards so the result can actually be read.

setlocal

set "PROJECT=C:\Users\Yosef\projects\yorbit-life-os"

REM Git for Windows installs to one of these two places.
set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=C:\Program Files (x86)\Git\bin\bash.exe"

if not exist "%BASH%" (
  echo.
  echo Could not find Git Bash in the usual places.
  echo Looked for:
  echo   C:\Program Files\Git\bin\bash.exe
  echo   C:\Program Files ^(x86^)\Git\bin\bash.exe
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
REM         NOT be a synced folder — OneDrive/iCloud would happily upload
REM         the readable copy in the seconds before it's deleted.
REM   2nd = iCloud Drive, which receives ONLY the finished encrypted file.
cd /d "%PROJECT%"
"%BASH%" -lc "./scripts/backup.sh /c/Users/Yosef/yorbit-backups '/c/Users/Yosef/iCloudDrive/Yorbit Backups'"

echo.
echo ============================================
echo   Finished. Read the message above.
echo ============================================
echo.
pause
