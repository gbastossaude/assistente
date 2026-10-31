@echo off
REM Inicia o worker local do Especialista IA (mantenha esta janela aberta ou use o início automático).
cd /d "%~dp0..\.."
title Especialista IA - worker local
:loop
call npm run worker
echo O worker parou (codigo %ERRORLEVEL%). Reiniciando em 15 segundos... (Ctrl+C para sair)
timeout /t 15 /nobreak >nul
goto loop
