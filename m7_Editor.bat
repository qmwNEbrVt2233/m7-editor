@echo off
REM 启动开发服务器
start npm run dev
REM 等待Vite启动（3秒）
timeout /t 3 /nobreak
REM 用默认浏览器打开localhost
start http://localhost:5173