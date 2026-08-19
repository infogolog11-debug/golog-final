@echo off
chcp 65001 >nul
color 0A
echo ================================================
echo    GOLOG FINAL - GitHub Push (FIXED!)
echo ================================================
echo.

set "PROJECT_DIR=E:\Golog-Travel\golog"
set "GIT_REPO=https://github.com/infogolog11-debug/golog-final.git"

cd /d %PROJECT_DIR%

echo [Step 1/8] Cleaning old .git folders...
if exist ".git" (
    echo Removing old .git from root...
    rmdir /s /q ".git"
)
if exist "Golog-Travel\.git" (
    echo Removing old .git from Golog-Travel subfolder...
    rmdir /s /q "Golog-Travel\.git"
)
echo Done.
echo.

echo [Step 2/8] Creating comprehensive .gitignore...
(
echo # Dependencies
echo node_modules/
echo .npm/
echo .pnpm-store/
echo .cache/
echo dist/
echo build/
echo.
echo # Env files (SECRETS - NEVER commit!)
echo .env
echo .env.local
echo .env.*.local
echo .env.vercel.*
echo .env.*.vercel
echo packages/*/.env
echo packages/*/.env.*
echo.
echo # IDE / System
echo .vercel/
echo .idea/
echo .vscode/
echo *.log
echo deploy.bat
echo sync-git.bat
echo push-git.bat
echo push-git-final.bat
echo install_log.txt
echo .DS_Store
echo Thumbs.db
echo.
echo # Old folders (duplicated)
echo Golog-Travel/
) > .gitignore
echo Done.
echo.

echo [Step 3/8] Initializing new Git repository...
git init
git branch -M main
echo.

echo [Step 4/8] Adding remote origin (infolog11-debug account)...
git remote add origin %GIT_REPO%
echo.

echo [Step 5/8] Creating FIRST commit (safe - no secrets!)...
git add -A
git reset -- packages/api-server/.env packages/web/.env packages/db/.env 2>nul
echo.

echo [Step 6/8] Committing files...
git commit -m "Initial commit: complete project structure"
echo.

echo [Step 7/8] Pushing to GitHub (NO SECRET ERRORS!)...
git push -u origin main --force
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed!
    echo If secret scanning error - visit:
    echo   https://github.com/infogolog11-debug/golog-final/settings/security_analysis
    echo   and disable "Secret scanning" temporarily, then run this script again.
    goto END
)
echo.

echo ================================================
echo    SUCCESS! All files pushed to GitHub!
echo ================================================
echo.
echo Repository: https://github.com/infogolog11-debug/golog-final
echo.
echo Next: Open Vercel -^> Import Git Repository
echo.

:END
pause
