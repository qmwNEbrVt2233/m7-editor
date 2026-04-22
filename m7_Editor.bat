@echo off
start npm run dev -- --port 2388
REM 等待Vite启动
timeout /t 1 /nobreak
REM 打开浏览器
start http://localhost:2388