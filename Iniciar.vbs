Option Explicit

Dim WshShell, FSO, sDir, nodeModDir

Set WshShell = CreateObject("WScript.Shell")
Set FSO      = CreateObject("Scripting.FileSystemObject")

' Directorio del script
sDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
WshShell.CurrentDirectory = sDir

' Instalar dependencias si no existen
nodeModDir = sDir & "node_modules"
If Not FSO.FolderExists(nodeModDir) Then
    MsgBox "Instalando PelisStream por primera vez..." & vbCrLf & "Espera un momento.", 64, "PelisStream"
    WshShell.Run "cmd /c npm install", 1, True
End If

' Matar cualquier instancia previa en el puerto 3000
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do taskkill /PID %a /F >nul 2>&1", 0, True

' Iniciar servidor de manera visible (ventana normal)
WshShell.Run "cmd /k node server.js", 1, False

' Esperar a que arranque
WScript.Sleep 2500

' Abrir navegador
WshShell.Run "http://localhost:3000"
