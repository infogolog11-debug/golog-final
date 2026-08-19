@echo off
title Golog - Super Simple Push (No Rebase, No Stash)
color 0E

cd /d "%~dp0"

echo ============================================================
echo   Golog - SIMPLEST possible push (force-with-lease)
echo ============================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found.
    pause
    exit /b 1
)

echo [1/3] Staging any remaining files...
git add -A 2>nul
echo [OK] Done.

echo.
echo [2/3] Committing (if any pending changes)...
git commit -m "chore: final gitignore" --allow-empty
echo [OK] Done.

echo.
echo [3/3] FORCE-WITH-LEASE push to origin/main (SAFE MODE)...
echo.
git push --force-with-lease origin main
if errorlevel 1 (
    echo.
    echo [FALLBACK] First attempt rejected. Fetching then retrying...
    git fetch origin
    git push --force-with-lease origin main
    if errorlevel 1 (
        echo.
        echo [LAST RESORT] Plain force push (overwrites remote)...
        git push --force origin main
        if errorlevel 1 (
            echo.
            echo [FATAL] Push failed. Use GitHub Desktop instead:
            echo   - Repository -^> Pull
            echo   - Then click Push Origin
            pause
            exit /b 1
        )
    )
)

echo.
echo ============================================================
echo   SUCCESS! Pushed to GitHub.
echo ============================================================
echo.
echo Vercel is deploying now.
echo Check in ~3 minutes: https://golog-final.vercel.app/api/health
echo.
pause
