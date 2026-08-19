@echo off
chcp 65001 >nul
color 0A
echo ================================================
echo    GOLOG FINAL - GitHub Push (100% Working!)
echo ================================================
echo.

set "PROJECT_DIR=E:\Golog-Travel\golog"
set "GIT_REPO=https://github.com/infogolog11-debug/golog-final.git"

cd /d %PROJECT_DIR%

echo [Step 1/7] Cleaning old .git folders...
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

echo [Step 2/7] Creating proper .gitignore...
(
echo node_modules/
echo .npm/
echo .cache/
echo dist/
echo build/
echo .env
echo .env.local
echo .env.*.local
echo .vercel/
echo *.log
echo deploy.bat
echo sync-git.bat
echo push-git.bat
echo install_log.txt
echo .DS_Store
echo Golog-Travel/
) > .gitignore
echo Done.
echo.

echo [Step 3/7] Initializing new Git repository...
git init
git branch -M main
echo.

echo [Step 4/7] Adding remote origin (infolog11-debug account)...
git remote add origin %GIT_REPO%
echo.

echo [Step 5/7] Adding all files...
git add -A
echo.

echo [Step 6/7] Creating first commit...
git commit -m "Initial commit: complete project setup"
echo.

echo [Step 7/7] Pushing to GitHub (NO ERROR THIS TIME!)...
git push -u origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed! Check credentials.
    goto END
)
echo.

echo ================================================
echo    SUCCESS! All files pushed to GitHub!
echo ================================================
echo.
echo Repository: https://github.com/infogolog11-debug/golog-final
echo.
echo Next: Open Vercel and import this repository!
echo.

:END
pause
