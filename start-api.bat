@echo off
chcp 65001 >nul
title Golog - API Server
cls
echo.
echo  ============================================
echo   خادم الـ API - منصة قوقل
echo  ============================================
echo.
echo  📍 المنفذ:  8080
echo  🏥 فحص الصحة:  http://localhost:8080/health
echo  📚 مسارات API: http://localhost:8080/api/...
echo.
cd /d %~dp0packages\api-server
npm run dev
pause
