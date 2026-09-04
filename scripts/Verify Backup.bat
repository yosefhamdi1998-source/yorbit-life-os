@echo off
REM Double-click to prove the newest backup actually opens and is complete.
REM Decrypts it, checks it, then deletes the decrypted copy.

setlocal

set "PROJECT=C:\Users\Yosef\projects\yorbit-life-os"

set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=C:\Program Files (x86)\Git\bin\bash.exe"

if not exist "%BASH%" (
  echo.
  echo Could not find Git Bash. Tell Claude this message.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Verify Yorbit backup
echo ============================================
echo.
echo This checks that your most recent backup really
echo opens with your password and is not truncated.
echo.
echo Nothing is changed. Nothing is restored.
echo.

cd /d "%PROJECT%"
"%BASH%" -lc "./scripts/verify-backup.sh '/c/Users/Yosef/iCloudDrive/Yorbit Backups' /c/Users/Yosef/yorbit-backups"

echo.
echo ============================================
echo   Finished. Read the message above.
echo ============================================
echo.
pause
