using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
namespace SmartHome.VmManagement {
// Disposable-CI native checks. No production config is loaded by selftest.
public static class SelfTest {
 static int count;
 static void Check(bool pass,string name) { Guard.Require(pass,"test_"+name);count++;Console.WriteLine("PASS "+name); }
 static void Denied(Action action,string name) { bool rejected=false;try {action();}catch {rejected=true;}Check(rejected,name); }
 public static int Run() {
  var sid=WindowsIdentity.GetCurrent().User.Value;var exe=Assembly.GetExecutingAssembly().Location;var hash=Guard.Hash(exe);
  Denied(()=>Guard.Full(@"C:\safe\..\escape"),"path_traversal");Denied(()=>Guard.Full(@"\\server\share"),"unc_path");Denied(()=>Guard.Full(@"C:\safe\file:stream"),"alternate_stream");
  Denied(()=>Guard.Keys(Guard.Parse("{\"action\":\"health\",\"command\":\"whoami\"}"),"action"),"extra_command");Check(!Host.Operations.Contains("powershell"),"no_shell_operation");
  using(var pipe=Pipe.Server("SmartHome-WebCoRE-Selftest",sid)) {
   Denied(()=>{using(var duplicate=Pipe.Server("SmartHome-WebCoRE-Selftest",sid)){}},"first_instance");
   string peer=null;var t=new Thread(()=>{pipe.WaitForConnection();Pipe.Receive(pipe);peer=Pipe.Peer(pipe,exe,hash);Pipe.Send(pipe,new {ok=true});pipe.Disconnect();});t.Start();
   var result=Pipe.Call("SmartHome-WebCoRE-Selftest",exe,hash,new {action="health"},10000,sid);t.Join();Check((bool)result["ok"]&&peer==sid,"mutual_peer_identity");
  }
  using(var stream=new MemoryStream(new byte[]{1,16,0,0})) Denied(()=>Pipe.Receive(stream),"oversize_frame");
  Console.WriteLine("Native security checks passed: "+count);return 0;
 }
}
}
