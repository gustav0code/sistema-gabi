@echo off
echo.
echo ================================================
echo    SISTEMA GABI - Consultorio de Psicologia
echo ================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao esta instalado.
    echo Baixe em: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
)

echo Iniciando servidor...
echo Abrindo navegador em http://localhost:3000
echo.
echo Para encerrar, feche esta janela ou pressione Ctrl+C
echo.

start "" http://localhost:3000
node --no-warnings server.js

pause
