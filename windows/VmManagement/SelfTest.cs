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
  var pointer=@"C:\runtime\windows-readonly-launcher.cjs";
  foreach(var encoding in new[]{"forward","escaped","backslash"}) Check(Host.DecodePointer(Host.EncodePointer(pointer,encoding))==pointer,"pointer_"+encoding);
  Denied(()=>Host.EncodePointer(pointer,"unsupported"),"pointer_encoding_allowlist");
  Check(Host.CommandMatches("node \"C:/runtime/windows-readonly-launcher.cjs\"",pointer),"forward_wrapper_command");
  Check(!Host.CommandMatches("node \"C:/runtime/windows-readonly-launcher.cjs\" --eval unapproved",pointer),"extra_command_args_rejected");
  var now=DateTime.UtcNow;var approval=new Request{Status="pending",Expires=now.AddMinutes(1)};Check(Host.CanApprove(approval,now,false),"scoped_pending_approval");Check(!Host.CanApprove(approval,now,true),"approval_concurrency");approval.Expires=now.AddSeconds(-1);Check(!Host.CanApprove(approval,now,false),"expired_approval");approval.Expires=now.AddMinutes(1);approval.Status="consumed";Check(!Host.CanApprove(approval,now,false),"consumed_approval");
  var view=Guard.Parse(Guard.Json.Serialize(new{operation="deploy_release",status="succeeded",requestId=new string('a',48),commit=new string('b',40),sha256=new string('c',64),expectedCurrentSha256=new string('d',64),expiresAt="2030-01-01T00:00:00Z",result=new{ok=true}}));
  var details=Host.ApprovalDetails(view);
  Check(details.Contains("status: succeeded")&&details.Contains("sha256: "+new string('c',64)),"readable_approval_status_and_digest");
  Check(details.Contains("expectedCurrentSha256: "+new string('d',64))&&details.Contains("requestId: "+new string('a',48)),"readable_approval_preserves_complete_scope");
  using(var pipe=Pipe.Server("SmartHome-WebCoRE-Selftest",sid)) {
   Denied(()=>{using(var duplicate=Pipe.Server("SmartHome-WebCoRE-Selftest",sid)){}},"first_instance");
   string peer=null;var t=new Thread(()=>{pipe.WaitForConnection();Pipe.Receive(pipe);peer=Pipe.Peer(pipe,exe,hash);Pipe.Send(pipe,new {ok=true});pipe.Disconnect();});t.Start();
   var result=Pipe.Call("SmartHome-WebCoRE-Selftest",exe,hash,new {action="health"},10000,sid);t.Join();Check((bool)result["ok"]&&peer==sid,"mutual_peer_identity");
  }
  using(var stream=new MemoryStream(new byte[]{1,16,0,0})) Denied(()=>Pipe.Receive(stream),"oversize_frame");
  var node=Environment.GetEnvironmentVariable("SMART_HOME_TEST_NODE");Guard.Require(!String.IsNullOrEmpty(node),"test_node_required");
  var root=Path.Combine(Path.GetTempPath(),"SmartHomeNative-"+Guard.Id());Directory.CreateDirectory(root);
  try {
   var publicFile=Path.Combine(root,"public-runtime.txt");File.WriteAllText(publicFile,"not-secret");
   var publicAcl=new FileSecurity();publicAcl.SetAccessRuleProtection(true,false);publicAcl.SetOwner(new SecurityIdentifier("S-1-5-32-544"));
   foreach(var owner in new[]{"S-1-5-18","S-1-5-32-544"})publicAcl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(owner),FileSystemRights.FullControl,AccessControlType.Allow));
   publicAcl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-11"),FileSystemRights.ReadAndExecute,AccessControlType.Allow));File.SetAccessControl(publicFile,publicAcl);
   Guard.ProtectedRuntime(publicFile);Check(true,"public_runtime_readers_allowed");
   Denied(()=>Guard.Protected(publicFile),"confidential_input_readers_rejected");
   publicAcl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-11"),FileSystemRights.Modify,AccessControlType.Allow));File.SetAccessControl(publicFile,publicAcl);
   Denied(()=>Guard.ProtectedRuntime(publicFile),"public_runtime_writers_rejected");
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
