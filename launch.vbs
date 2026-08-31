Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\Desktop\component-hub"
' Start server in hidden window, output to log file
WshShell.Run "cmd /c cd /d D:\Desktop\component-hub && node server.js > server.log 2>&1", 0, False
' Wait then open index.html directly (file protocol)
WScript.Sleep 2000
WshShell.Run "D:\Desktop\component-hub\index.html", 1
