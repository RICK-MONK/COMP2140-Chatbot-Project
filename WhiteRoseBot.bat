@echo off
title White Rose Server (DO NOT CLOSE)
color 0A
cls

:: 1. Launch the Dashboard (The pretty interface)
:: This attempts to open Chrome in App Mode. If Chrome isn't found, it tries Edge.
start chrome --app=http://localhost:3000/dashboard.html || start msedge --app=http://localhost:3000/dashboard.html

:: 2. Launch the Server (The black window) MINIMIZED
:: This opens a new minimized window for the bot so it stays out of your way
start /min cmd /k "node index.js"

:: 3. Close this launcher window
exit