@echo off
title Ist_Mix_Musik - GitHub Sync & Push
cd /d "%~dp0"

echo ======================================================
echo    Ist_Mix_Musik - GitHub Synchronisation & Push
echo ======================================================
echo.

git remote -v | findstr "origin" >nul
if %ERRORLEVEL% NEQ 0 (
    echo Noch kein GitHub Repository verknuepft!
    echo.
    echo Bitte erstelle ein neues Repository namens 'Ist_Mix_Musik' auf GitHub:
    echo https://github.com/new
    echo.
    set /p REPO_URL="Fuege die GitHub Repository URL ein (z.B. https://github.com/istvancsovrij/Ist_Mix_Musik.git): "
    if defined REPO_URL (
        git remote add origin %REPO_URL%
        git branch -M main
        echo Repository verknuepft mit %REPO_URL%
    ) else (
        echo Abbruch. Keine URL eingegeben.
        pause
        exit /b
    )
)

echo.
echo [1/3] Aenderungen erfassen...
git add .

echo.
set /p COMMIT_MSG="[2/3] Was hast du geaendert? (z.B. Neue Beats oder Design-Update): "
if not defined COMMIT_MSG (
    set COMMIT_MSG=Update Ist_Mix_Musik
)

git commit -m "%COMMIT_MSG%"

echo.
echo [3/3] Zu GitHub hochladen (Push)...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================
    echo    Erfolgreich auf GitHub hochgeladen!
    echo ======================================================
) else (
    echo.
    echo Es gab ein Problem beim Hochladen. Pruefe deine GitHub-Anmeldedaten.
)

echo.
pause
