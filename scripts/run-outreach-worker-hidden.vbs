Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\User\ai-lidgen-os"

cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""C:\Users\User\ai-lidgen-os\scripts\run-outreach-worker.ps1"""

exitCode = sh.Run(cmd, 0, True)
WScript.Quit exitCode
