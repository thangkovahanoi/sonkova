Option Explicit
Dim fso, shell, root, bat
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
bat = fso.BuildPath(root, "START-KHO-XPRINTER-V5.bat")
If fso.FileExists(bat) Then
  shell.Run Chr(34) & bat & Chr(34), 7, False
Else
  MsgBox "Khong tim thay START-KHO-XPRINTER-V5.bat tai:" & vbCrLf & root, 16, "KHO XPRINTER V5"
End If
