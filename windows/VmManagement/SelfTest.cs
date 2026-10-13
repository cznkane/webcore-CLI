using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Diagnostics;
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
  var now=DateTime.UtcNow;var approval=new Request{Status="pending",Expires=now.AddMinutes(1)};Check(Host.CanApprove(approval,now,false),"scoped_pending_approval");Check(!Host.CanApprove(approval,now,true),"approval_concurrency");approval.Expires=now.AddSeconds(-1);Check(!Host.CanApprove(approval,now,false),"expired_approval");approval.Expires=now.AddMinutes(1);approval.Status="consumed";Check(!Host.CanApprove(approval,now,false),"consumed_approval");
  using(var pipe=Pipe.Server("SmartHome-WebCoRE-Selftest",sid)) {
   Denied(()=>{using(var duplicate=Pipe.Server("SmartHome-WebCoRE-Selftest",sid)){}},"first_instance");
   string peer=null;var t=new Thread(()=>{pipe.WaitForConnection();Pipe.Receive(pipe);peer=Pipe.Peer(pipe,exe,hash);Pipe.Send(pipe,new {ok=true});pipe.Disconnect();});t.Start();
   var result=Pipe.Call("SmartHome-WebCoRE-Selftest",exe,hash,new {action="health"},10000,sid);t.Join();Check((bool)result["ok"]&&peer==sid,"mutual_peer_identity");
  }
  using(var stream=new MemoryStream(new byte[]{1,16,0,0})) Denied(()=>Pipe.Receive(stream),"oversize_frame");
  var node=Environment.GetEnvironmentVariable("SMART_HOME_TEST_NODE");Guard.Require(!String.IsNullOrEmpty(node),"test_node_required");
  var root=Path.Combine(Path.GetTempPath(),"SmartHomeNative-"+Guard.Id());Directory.CreateDirectory(root);
  try {
   File.WriteAllText(Path.Combine(root,"package.json"),"{\"type\":\"module\"}");
   var pidFile=Path.Combine(root,"child.pid");var pidLiteral=Guard.Json.Serialize(pidFile);
   var fixture="import {spawn} from 'node:child_process';import fs from 'node:fs';const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});fs.writeFileSync("+pidLiteral+",String(c.pid));c.unref();";
   File.WriteAllText(Path.Combine(root,"containment.test.js"),fixture);
   var normal=Guard.Parse(Guard.Json.Serialize(Job.Run(node,root,"--test",10000,root)));Check((bool)normal["ok"],"job_normal_exit");
   var pid=Int32.Parse(File.ReadAllText(pidFile));bool alive=false;try{using(var child=Process.GetProcessById(pid))alive=!child.HasExited;}catch(ArgumentException){}Check(!alive,"detached_child_killed");
   File.WriteAllText(Path.Combine(root,"containment.test.js"),fixture+"setInterval(()=>{},1000);");
   var timed=Guard.Parse(Guard.Json.Serialize(Job.Run(node,root,"--test",1000,root)));Check((bool)timed["timedOut"],"job_timeout");
   pid=Int32.Parse(File.ReadAllText(pidFile));alive=false;try{using(var child=Process.GetProcessById(pid))alive=!child.HasExited;}catch(ArgumentException){}Check(!alive,"timeout_descendant_killed");
  }finally{Directory.Delete(root,true);}
  Console.WriteLine("Native security checks passed: "+count);return 0;
 }
}
}
