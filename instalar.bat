@echo off
echo.
echo ================================================
echo    SISTEMA GABI - Instalacao
echo ================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado!
    echo Baixe e instale em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Node.js encontrado. Instalando dependencias...
echo.
call npm install
if %errorlevel% neq 0 (
    echo ERRO ao instalar dependencias.
    pause
    exit /b 1
)

echo.
echo ================================================
echo    Instalacao concluida!
echo    Execute iniciar.bat para abrir o sistema.
echo ================================================
echo.
pause
