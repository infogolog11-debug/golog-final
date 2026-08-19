@echo off
chcp 65001 >nul
title Golog - Development Servers
cls
echo.
echo  ██████╗  ██████╗ ██╗      ██████╗  ██████╗ 
echo  ██╔══██╗██╔═══██╗██║     ██╔═══██╗██╔════╝ 
echo  ██████╔╝██║   ██║██║     ██║   ██║██║  ███╗
echo  ██╔══██╗██║   ██║██║     ██║   ██║██║   ██║
echo  ██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝
echo  ╚═════╝  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ 
echo.
echo  ============================================
echo   بدء تشغيل سيرفرات التطوير لمنصة قوقل
echo  ============================================
echo.

echo [1/2] تشغيل خادم الـ API على المنفذ 8080...
start "Golog API Server" cmd /k "cd /d %~dp0packages\api-server && npm run dev"

timeout /t 3 /nobreak >nul

echo [2/2] تشغيل خادم الواجهة على المنفذ 5173...
start "Golog Web Server" cmd /k "cd /d %~dp0 && npm run dev --workspace=@golog/web"

timeout /t 3 /nobreak >nul

echo.
echo  ✅ تم تشغيل جميع الخوادم بنجاح!
echo.
echo  📱 الواجهة:     http://localhost:5173
echo  🔧 خادم API:    http://localhost:8080/health
echo.
echo  💡 اضغط على أي مفتاح لفتح الواجهة في المتصفح الافتراضي...
pause >nul
start http://localhost:5173
echo.
echo  شكراً لاستخدامك قوقل ✨
pause
