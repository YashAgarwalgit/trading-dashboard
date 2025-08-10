@echo off
echo Starting Trading Platform Backend...
cd /d "%~dp0"
cd backend
python stock_service.py
pause
