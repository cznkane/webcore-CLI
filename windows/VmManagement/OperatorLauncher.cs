using System;
using System.Diagnostics;
using System.Windows.Forms;
public static class OperatorLauncher {
 [STAThread] public static void Main() {
  try { Process.Start(new ProcessStartInfo { FileName=@"C:\ProgramData\SmartHome\VmManagement\bin\VmManagement.exe",Arguments="operator",UseShellExecute=true,Verb="runas" }); }
  catch { MessageBox.Show("Independent operator approval was not opened. No approval was issued.","Smart Home VM Approval"); }
 }
}
