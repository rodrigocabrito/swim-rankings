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

rem Start fresh: clear last run's downloads and parsed files so this pull is
rem current. (If a run is interrupted by 502s, DON'T re-run this bat - instead run
rem "node scrape-cdp.js" directly, which resumes and keeps what's already downloaded.)
echo.
echo Clearing previous downloads for a fresh pull...
if exist "%~dp0downloads\*.xlsx" del /q "%~dp0downloads\*.xlsx"
if exist "%~dp0parsed\*.json" del /q "%~dp0parsed\*.json"

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
