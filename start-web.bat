@echo off
chcp 65001 >nul
title Golog - Web Server
cls
echo.
echo  ============================================
echo   خادم الواجهة الأمامية - منصة قوقل
echo  ============================================
echo.
echo  🌐 الواجهة:  http://localhost:5173
echo  🔧 Proxy API  تلقائيًّا من /api إلى المنفذ 8080
echo.
cd /d %~dp0
npm run dev --workspace=@golog/web
pause
