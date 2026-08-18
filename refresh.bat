@echo off
setlocal
cd /d "%~dp0"
title Swim Rankings - Weekly Refresh

echo ============================================
echo   SWIM RANKINGS - WEEKLY REFRESH
echo ============================================
echo.

rem --- Locate Chrome ------------------------------------------------------
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo ERROR: Could not find Chrome. Edit refresh.bat and set the CHROME path.
  pause
  exit /b 1
)

rem --- Open debug Chrome on the first ranking page ------------------------
echo Opening Chrome (debug profile)...
start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%~dp0.chrome-cdp" "https://www.swimrankings.net/index.php?page=rankingDetail&clubId=65881&gender=1&course=LCM&agegroup=0&stroke=0&season=-1"

echo.
echo   A Chrome window opened.
echo   If you see the "Confirme que e humano" checkbox, click it so the
echo   ranking table loads. If the page is already showing rankings, great.
echo.
echo   Then press any key here to start the refresh...
pause >nul

echo.
echo [1/3] Downloading from swimrankings...
call node scrape-cdp.js
if errorlevel 1 goto :failed

echo.
echo [2/3] Parsing files...
call node parse.js
if errorlevel 1 goto :failed

echo.
echo [3/3] Uploading to Firestore...
call node upload.js
if errorlevel 1 goto :failed

echo.
echo ============================================
echo   DONE. The website will show fresh data
echo   within the hour: https://rankings-swim.vercel.app
echo ============================================
echo.
pause
exit /b 0

:failed
echo.
echo ############################################
echo   A STEP FAILED - see the messages above.
echo ############################################
echo.
pause
exit /b 1
