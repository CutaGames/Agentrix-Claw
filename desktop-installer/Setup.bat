@echo off
:: Agentrix-Claw Agent Installer
:: Called by Agentrix-Claw-Setup.exe  (IExpress -> cmd /C Setup.bat -> powershell)
:: No "start" here: cmd waits for powershell, IExpress waits for cmd,
:: so the temp dir stays alive for the full install session.
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0install-gui.ps1"
