using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Management;
using System.Net.Http;
using System.Reflection;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SmartHome.VmManagement {
public sealed class Config {
 public string Root, WorkerSid, OperatorSid, ExeSha256, NodePath, NodeSha256, WorkerNodePath, WorkerNodeSha256, TunnelConfig, TunnelExe, TunnelExeSha256, McpTaskXmlSha256, WatchdogTaskXmlSha256, InitialCommand, InitialConfigSha256, CandidateCommit, CandidateSha256, ReleaseEntryPoint;
}
public sealed class Release { public string Commit, Sha256, Root, Version, EntryPoint; public bool IsSnapshot; public Dictionary<string,string> Files; }
public sealed class State { public Release Current, Previous;public string ConfigSha256, CommandRoot, CommandText, CommandEncoding;public string Recovery="clean"; }
public sealed class Request { public string Id,Operation,Commit,Sha256,ExpectedCurrentSha256,Status;public DateTime Expires;public object Result; }
public static class Host {
 public static readonly string[] Operations={"run_webcore_tests","run_webcore_syntax_check","stage_release","deploy_release","rollback_release","restart_mcp"};
 static readonly string exe=Assembly.GetExecutingAssembly().Location;
 static readonly string configPath=Path.Combine(Path.GetDirectoryName(exe),"..","config.json");
 static Config c; static readonly object sync=new object();static readonly Dictionary<string,Request> requests=new Dictionary<string,Request>(); static bool busy;
 const string BrokerPipe="SmartHome-WebCoRE-Management",OperatorPipe="SmartHome-WebCoRE-Approval",WorkerPipe="SmartHome-WebCoRE-Worker";
 static void Load() {
  var path=Path.GetFullPath(configPath);Guard.NoReparse(path);c=Guard.Read<Config>(path);
  ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  Guard.Full(c.Root);Guard.Require(String.Equals(Path.GetFullPath(exe),Path.Combine(c.Root,"bin","VmManagement.exe"),StringComparison.OrdinalIgnoreCase),"installation_path");
  Guard.Protected(path,c.WorkerSid);Guard.Protected(exe,c.WorkerSid);
  Guard.Require(Guard.Hash(exe)==c.ExeSha256,"host_integrity");
  Guard.Require(c.OperatorSid!="S-1-5-18"&&c.OperatorSid!=c.WorkerSid&&c.WorkerSid!="S-1-5-18","identity_separation");
 }
 [STAThread] public static int Main(string[] args) {
  try {
   Guard.Require(args.Length==1,"fixed_mode_required");
   if(args[0]=="selftest") {try{return SelfTest.Run();}catch(Exception e){Console.Error.WriteLine(e.ToString());return 2;}}
   Load();
   if(args[0]=="client") { Guard.Require(File.Exists(Path.Combine(c.Root,"installed.json")),"not_commissioned"); Guard.Require(WindowsIdentity.GetCurrent().User.Value=="S-1-5-18","system_client_required");var text=ReadInput(); Console.WriteLine(Guard.Json.Serialize(Pipe.Call(BrokerPipe,exe,c.ExeSha256,Guard.Parse(text))));return 0; }
   if(args[0]=="operator-client") { Guard.Require(WindowsIdentity.GetCurrent().User.Value==c.OperatorSid&&new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),"operator_identity");Console.WriteLine(Guard.Json.Serialize(Pipe.Call(OperatorPipe,exe,c.ExeSha256,Guard.Parse(ReadInput()))));return 0; }
   if(args[0]=="operator") { Operator();return 0; }
   if(args[0]=="probe") { Console.WriteLine(Guard.Json.Serialize(Pipe.Call(OperatorPipe,exe,c.ExeSha256,new { action="list" })));return 0; }
   if(args[0]=="broker") {
    Pipe.AllowIdentityQuery(c.WorkerSid);
    Guard.Require(WindowsIdentity.GetCurrent().User.Value=="S-1-5-18","system_broker_required");
    using(var mutex=new Mutex(false,@"Global\SmartHome-WebCoRE-Management")) {
     Guard.Require(mutex.WaitOne(0),"duplicate_broker");
     // Persisted recovery marker disables mutations after uncertain cutover or crash.
     var thread=new Thread(()=>Serve(OperatorPipe,c.OperatorSid,true,false));thread.IsBackground=true;thread.Start();
     Serve(BrokerPipe,"S-1-5-18",false,false);
    } return 0;
   }
   if(args[0]=="worker") { Guard.Require(WindowsIdentity.GetCurrent().User.Value==c.WorkerSid&&!WindowsIdentity.GetCurrent().Groups.Any(group=>group.Value=="S-1-5-32-544"),"restricted_worker_required");Serve(WorkerPipe,"S-1-5-18",false,true);return 0; }
   throw new InvalidOperationException("unknown_mode");
  } catch(Exception failure) { var code=Regex.IsMatch(failure.Message,@"\A[a-z_]{1,64}\z")?failure.Message:"boundary_failure";Console.Error.WriteLine("VM management failed closed: "+code);if(args.Length==1&&args[0]=="worker"&&c!=null){try{Guard.Write(Path.Combine(c.Root,"scratch","worker-startup-error.json"),new{error=code});}catch{}}return 2; }
 }
 static string ReadInput() { var b=new char[4097];int n=0,k;while(n<b.Length&&(k=Console.In.Read(b,n,b.Length-n))>0) n+=k;Guard.Require(n<=4096,"request_limit");return new string(b,0,n); }
 static void Serve(string name,string sid,bool op,bool worker) {
  using(var pipe=Pipe.Server(name,sid)) while(true) {
   pipe.WaitForConnection();
   using(var timer=new System.Threading.Timer(_=>pipe.Dispose(),null,worker?150000:10000,Timeout.Infinite)) {
    try {
     var message=Pipe.Receive(pipe);
     string actual=Pipe.Peer(pipe,exe,c.ExeSha256);Guard.Require(actual==sid,"peer_sid");
     var result=worker?Work(message):op?OperatorRequest(message):BrokerRequest(message);
     Pipe.Send(pipe,result);
    } catch(Exception failure) { if(!worker) {try {Guard.Audit(c.Root,Guard.Id(),"ipc_request","denied",new string('0',64));}catch {throw;} } try { Pipe.Send(pipe,new { ok=false,error="request_rejected",reason=Regex.IsMatch(failure.Message,@"\A[a-z_]{1,64}\z")?failure.Message:"boundary_failure" }); } catch {} }
   }
   // Partial-frame timeout closes the listener; scheduled-task restart recreates it.
   if(pipe.IsConnected) pipe.Disconnect();
  }
 }
 static State GetState() { var path=Path.Combine(c.Root,"state.json");Guard.Protected(path,c.WorkerSid);return Guard.Read<State>(path); }
 static void Save(State s) { Guard.Write(Path.Combine(c.Root,"state.json"),s); }
 static Release Find(string commit,string digest) {
  Guard.Require(Guard.Hex(commit,40)&&Guard.Hex(digest,64),"invalid_release");
  var path=Path.Combine(c.Root,"catalog",commit+".json");Guard.Protected(path,c.WorkerSid);var r=Guard.Read<Release>(path);
  Guard.Require(r.Commit==commit&&r.Sha256==digest&&r.Root==Path.Combine(c.Root,"releases",commit),"release_scope");Verify(r);return r;
 }
 public static void Verify(Release r) { VerifyFiles(r,true); }
 static void VerifyFiles(Release r,bool exact) {
  Guard.Require(r!=null&&r.Files!=null&&r.Files.Count>0&&r.Files.Count<=2048,"invalid_manifest");Guard.Protected(r.Root,c==null?null:c.WorkerSid);
  foreach(var entry in r.Files) { Guard.Require(!String.IsNullOrEmpty(entry.Key)&&entry.Key.Split('/').All(part=>part!="."&&part!=".."&&part.Length>0)&&!entry.Key.Contains("\\")&&!entry.Key.Contains(":"),"manifest_path");var p=Path.Combine(r.Root,entry.Key.Replace('/',Path.DirectorySeparatorChar));Guard.Protected(p,c==null?null:c.WorkerSid);Guard.Require(Guard.Hash(p)==entry.Value,"release_integrity"); }
  if(!exact) return;
  var actual=Directory.GetFiles(r.Root,"*",SearchOption.AllDirectories).Select(p=>p.Substring(r.Root.Length+1).Replace('\\','/')).OrderBy(x=>x).ToArray();
  Guard.Require(actual.SequenceEqual(r.Files.Keys.OrderBy(x=>x)),"unexpected_release_file");
  foreach(var d in Directory.GetDirectories(r.Root,"*",SearchOption.AllDirectories)) Guard.Protected(d,c==null?null:c.WorkerSid);
 }
 static object BrokerRequest(Dictionary<string,object> m) {
  var action=Guard.Text(m,"action");
  if(action=="status") { Guard.Keys(m,"action","requestId");var id=Guard.Text(m,"requestId");Guard.Require(Guard.Hex(id,48),"invalid_request_id");lock(sync) { Request r;Guard.Require(requests.TryGetValue(id,out r),"unknown_request");return View(r); } }
  if(action=="health") { Guard.Keys(m,"action");var s=GetState();return new { ok=true,busy=busy,currentCommit=s.Current.Commit,currentIsSnapshot=s.Current.IsSnapshot,currentVersion=s.Current.Version,currentSha256=s.Current.Sha256,previousCommit=s.Previous==null?null:s.Previous.Commit,recovery=s.Recovery,approvalChannel="local_operator" }; }
  Guard.Keys(m,"action","operation","commit","sha256","expectedCurrentSha256");Guard.Require(action=="request","unknown_action");
  var operation=Guard.Text(m,"operation");var commit=Guard.Text(m,"commit");var digest=Guard.Text(m,"sha256");var current=Guard.Text(m,"expectedCurrentSha256");
  Guard.Require(Operations.Contains(operation)&&Guard.Hex(commit,40)&&Guard.Hex(digest,64)&&Guard.Hex(current,64),"invalid_scope");
  lock(sync) {
   var state=GetState();Guard.Require(state.Recovery=="clean"&&state.Current.Sha256==current,"stale_or_recovery_required");
   Guard.Require(!busy&&requests.Values.Count(r=>r.Status=="pending"&&r.Expires>DateTime.UtcNow)<8,"capacity");
   if(operation!="stage_release") Find(commit,digest);
   if(operation=="restart_mcp") Guard.Require(commit==state.Current.Commit&&digest==state.Current.Sha256,"restart_scope");
   if(operation=="rollback_release") Guard.Require(state.Previous!=null&&state.Previous.Commit==commit&&state.Previous.Sha256==digest,"rollback_scope");
   var request=new Request{Id=Guard.Id(),Operation=operation,Commit=commit,Sha256=digest,ExpectedCurrentSha256=current,Status="pending",Expires=DateTime.UtcNow.AddMinutes(5)};
   Guard.Audit(c.Root,request.Id,operation,"requested",digest);requests.Add(request.Id,request);Prune();return View(request);
  }
 }
 static void Prune() { foreach(var id in requests.Where(x=>x.Value.Expires<DateTime.UtcNow.AddHours(-1)).Select(x=>x.Key).ToArray()) requests.Remove(id);Guard.Require(requests.Count<=1024,"history_capacity"); }
 static object View(Request r) { return new { requestId=r.Id,operation=r.Operation,commit=r.Commit,sha256=r.Sha256,expectedCurrentSha256=r.ExpectedCurrentSha256,status=r.Status,expiresAt=r.Expires.ToString("o"),result=r.Result }; }
 public static bool CanApprove(Request request,DateTime now,bool executing) {return request!=null&&request.Status=="pending"&&request.Expires>now&&!executing;}
 static object OperatorRequest(Dictionary<string,object> m) {
  var action=Guard.Text(m,"action");
  if(action!="list") Guard.Require(File.Exists(Path.Combine(c.Root,"installed.json")),"not_commissioned");
  if(action=="request") return BrokerRequest(m);
  if(action=="bootstrap") { Guard.Keys(m,"action");var state=GetState();return BrokerRequest(Guard.Parse(Guard.Json.Serialize(new{action="request",operation="deploy_release",commit=c.CandidateCommit,sha256=c.CandidateSha256,expectedCurrentSha256=state.Current.Sha256}))); }
  if(action=="list") { Guard.Keys(m,"action");lock(sync) return new { ok=true,requests=requests.Values.OrderByDescending(r=>r.Expires).Take(32).Select(View).ToArray() }; }
  Guard.Keys(m,"action","requestId");var id=Guard.Text(m,"requestId");Guard.Require(action=="approve"||action=="deny","unknown_operator_action");
  lock(sync) {
   Request r;Guard.Require(requests.TryGetValue(id,out r)&&CanApprove(r,DateTime.UtcNow,busy),"approval_unavailable");
   var state=GetState();Guard.Require(state.Recovery=="clean"&&state.Current.Sha256==r.ExpectedCurrentSha256,"stale_approval");
   // One use: consume before audit and execution; errors never restore approval.
   r.Status=action=="deny"?"denied":"consumed";
   Guard.Audit(c.Root,r.Id,r.Operation,r.Status,r.Sha256);
   if(action=="deny") return View(r);
   busy=true;Task.Run(()=>Execute(r));return View(r);
  }
 }
 static void RequireNetworkBoundary() {
  dynamic policy=Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2"));
  Guard.Require((bool)policy.FirewallEnabled[1]&&(bool)policy.FirewallEnabled[2]&&(bool)policy.FirewallEnabled[4],"worker_firewall_disabled");
  dynamic rule=policy.Rules.Item("SmartHome restricted worker outbound deny");
  Guard.Require((bool)rule.Enabled&&(int)rule.Action==0&&(int)rule.Direction==2&&((int)rule.Profiles&7)==7&&(int)rule.Protocol==256,"worker_firewall_drift");
  var descriptor=new System.Security.AccessControl.RawSecurityDescriptor((string)rule.LocalUserAuthorizedList);
  Guard.Require(descriptor.DiscretionaryAcl!=null&&descriptor.DiscretionaryAcl.Count==1&&((System.Security.AccessControl.CommonAce)descriptor.DiscretionaryAcl[0]).SecurityIdentifier.Value==c.WorkerSid,"worker_firewall_scope");
 }
 static void Execute(Request r) {
  try {
   RequireNetworkBoundary();
   Guard.Audit(c.Root,r.Id,r.Operation,"started",r.Sha256);
   object result;
   if(r.Operation=="stage_release") result=Stage(r);
   else if(r.Operation=="deploy_release"||r.Operation=="rollback_release"||r.Operation=="restart_mcp") result=Cutover(r);
   else result=Pipe.Call(WorkerPipe,exe,c.ExeSha256,new { action="validate",operation=r.Operation,commit=r.Commit,sha256=r.Sha256 },145000,c.WorkerSid);
   var json=Guard.Parse(Guard.Json.Serialize(result));bool ok=json.ContainsKey("ok")&&json["ok"] is bool&&(bool)json["ok"];
   Guard.Audit(c.Root,r.Id,r.Operation,ok?"succeeded":"failed",r.Sha256);
   lock(sync) { r.Status=ok?"succeeded":"failed";r.Result=result; }
  } catch(Exception failure) { try { Guard.Audit(c.Root,r.Id,r.Operation,"failed",r.Sha256); } catch {} lock(sync) { r.Status="failed";r.Result=new { ok=false,error=Regex.IsMatch(failure.Message,@"\A[a-z_]{1,64}\z")?failure.Message:"operation_failed_inspect_recovery" }; } }
  finally { lock(sync) busy=false; }
 }
 static object Work(Dictionary<string,object> m) {
  Guard.Keys(m,"action","operation","commit","sha256");Guard.Require(Guard.Text(m,"action")=="validate","unknown_worker_action");var op=Guard.Text(m,"operation");Guard.Require(op=="run_webcore_tests"||op=="run_webcore_syntax_check","worker_allowlist");
  var r=Find(Guard.Text(m,"commit"),Guard.Text(m,"sha256"));Guard.Protected(c.WorkerNodePath,c.WorkerSid);Guard.Require(Guard.Hash(c.WorkerNodePath)==c.WorkerNodeSha256,"node_integrity");
  var temp=Path.Combine(c.Root,"scratch",Guard.Id());Directory.CreateDirectory(temp);
  try {
   if(op=="run_webcore_tests") return Job.Run(c.WorkerNodePath,r.Root,"--test",120000,temp);
   var watch=Stopwatch.StartNew();
   foreach(var file in r.Files.Keys.Where(p=>(p.StartsWith("server/")&&p.EndsWith(".js"))||p=="windows-readonly-launcher.cjs").OrderBy(x=>x)) {
    Guard.Require(watch.ElapsedMilliseconds<120000,"syntax_timeout");var result=Guard.Parse(Guard.Json.Serialize(Job.Run(c.WorkerNodePath,r.Root,"--check \""+file.Replace('/','\\')+"\"",15000,temp)));
    if(!(bool)result["ok"]) return result;
   }
   return new { ok=true,exitCode=0,durationMs=watch.ElapsedMilliseconds,outputSuppressed=true };
  } finally { try { Directory.Delete(temp,true); } catch {} }
 }
 static object Stage(Request r) {
  var root=Path.Combine(c.Root,"releases",r.Commit);Guard.Require(!Directory.Exists(root),"release_exists");
  using(var client=new HttpClient(new HttpClientHandler { AllowAutoRedirect=false })) {
   client.Timeout=TimeSpan.FromSeconds(60);client.DefaultRequestHeaders.Add("User-Agent","SmartHome-VmManagement");
   RequireMerged(r.Commit);
   var archive=Path.Combine(c.Root,"downloads",r.Id+".zip");
   try {
    using(var resp=client.GetAsync("https://codeload.github.com/cznkane/webcore-CLI/zip/"+r.Commit,HttpCompletionOption.ResponseHeadersRead).Result) {
     resp.EnsureSuccessStatusCode();using(var input=resp.Content.ReadAsStreamAsync().Result) using(var output=new FileStream(archive,FileMode.CreateNew)) { var buffer=new byte[8192];int n,total=0;while((n=input.Read(buffer,0,buffer.Length))>0) {total+=n;Guard.Require(total<=20000000,"archive_limit");output.Write(buffer,0,n);}output.Flush(true); }
    }
    Guard.Require(Guard.Hash(archive)==r.Sha256,"archive_integrity");Directory.CreateDirectory(root);
    using(var zip=ZipFile.OpenRead(archive)) { int total=0;foreach(var e in zip.Entries) {
     var prefix="webcore-CLI-"+r.Commit+"/";Guard.Require(e.FullName.StartsWith(prefix),"archive_prefix");var relative=e.FullName.Substring(prefix.Length);
     if(relative.Length==0){Guard.Require(e.Length==0&&e.FullName.EndsWith("/"),"archive_root");continue;}
     if(relative.EndsWith("/")) continue;
     Guard.Require(relative.Split('/').All(p=>p.Length>0&&p!=".."&&p!=".")&&!relative.Contains("\\")&&!relative.Contains(":"),"archive_path");
     Guard.Require((e.ExternalAttributes>>16&0xF000)!=0xA000,"archive_symlink");
     if(!(relative.StartsWith("server/")||relative.StartsWith("test/")||new[]{"package.json","plugin.json","mcp.json",".mcp.json",".codex-plugin/plugin.json"}.Contains(relative))) continue;
     Guard.Require(e.Length<=1000000&&(total+=checked((int)e.Length))<=10000000,"expanded_limit");var path=Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar));Directory.CreateDirectory(Path.GetDirectoryName(path));e.ExtractToFile(path,false);
    } }
    var package=Guard.Parse(File.ReadAllText(Path.Combine(root,"package.json")));Guard.Require(!package.ContainsKey("dependencies")&&!package.ContainsKey("devDependencies"),"unsupported_dependencies");var scripts=package["scripts"] as System.Collections.Generic.Dictionary<string,object>;Guard.Require(scripts!=null&&Guard.Text(scripts,"test")=="node --test","unsupported_test_contract");
    File.WriteAllText(Path.Combine(root,"windows-readonly-launcher.cjs"),LauncherText,new UTF8Encoding(false));
    var release=new Release{Commit=r.Commit,Sha256=r.Sha256,Root=root,Version=Guard.Text(package,"version"),IsSnapshot=false,EntryPoint=c.ReleaseEntryPoint,Files=Directory.GetFiles(root,"*",SearchOption.AllDirectories).ToDictionary(p=>p.Substring(root.Length+1).Replace('\\','/'),Guard.Hash)};
    Guard.Write(Path.Combine(c.Root,"catalog",r.Commit+".json"),release);Verify(release);
    var syntax=Pipe.Call(WorkerPipe,exe,c.ExeSha256,new { action="validate",operation="run_webcore_syntax_check",commit=r.Commit,sha256=r.Sha256 },145000,c.WorkerSid);
    Guard.Require((bool)syntax["ok"],"staged_syntax_failed");var tests=Pipe.Call(WorkerPipe,exe,c.ExeSha256,new { action="validate",operation="run_webcore_tests",commit=r.Commit,sha256=r.Sha256 },145000,c.WorkerSid);
    Guard.Require((bool)tests["ok"],"staged_tests_failed");return new { ok=true,commit=r.Commit,sha256=r.Sha256,testsPassed=true,syntaxPassed=true };
   } catch { if(Directory.Exists(root)) Directory.Delete(root,true);var catalog=Path.Combine(c.Root,"catalog",r.Commit+".json");if(File.Exists(catalog)) File.Delete(catalog);throw; }
   finally { if(File.Exists(archive)) File.Delete(archive); }
  }
 }
 static void RequireMerged(string commit) {
  using(var client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false})) {client.Timeout=TimeSpan.FromSeconds(30);client.DefaultRequestHeaders.Add("User-Agent","SmartHome-VmManagement");var response=client.GetAsync("https://api.github.com/repos/cznkane/webcore-CLI/compare/"+commit+"...main").Result;response.EnsureSuccessStatusCode();var compare=Guard.Parse(response.Content.ReadAsStringAsync().Result);Guard.Require(new[]{"ahead","identical"}.Contains(Guard.Text(compare,"status")),"unmerged_release");}
 }
 static object Cutover(Request r) {
  if(r.Operation=="deploy_release") RequireMerged(r.Commit);
  var s=GetState();Guard.Require(s.Recovery=="clean"&&s.Current.Sha256==r.ExpectedCurrentSha256,"stale_cutover");var target=Find(r.Commit,r.Sha256);
  if(s.CommandRoot!=s.Current.Root) VerifyFiles(new Release{Commit=s.Current.Commit,Sha256=s.Current.Sha256,Root=s.CommandRoot,Files=s.Current.Files},false);
  var syntax=Pipe.Call(WorkerPipe,exe,c.ExeSha256,new { action="validate",operation="run_webcore_syntax_check",commit=r.Commit,sha256=r.Sha256 },145000,c.WorkerSid);Guard.Require((bool)syntax["ok"],"cutover_syntax_failed");
  var tests=Pipe.Call(WorkerPipe,exe,c.ExeSha256,new { action="validate",operation="run_webcore_tests",commit=r.Commit,sha256=r.Sha256 },145000,c.WorkerSid);Guard.Require((bool)tests["ok"],"cutover_tests_failed");
  Guard.Protected(c.TunnelExe);Guard.Require(Guard.Hash(c.TunnelExe)==c.TunnelExeSha256,"tunnel_integrity");
  Guard.Protected(c.TunnelConfig);Guard.Protected(c.NodePath);Guard.Require(Guard.Hash(c.NodePath)==c.NodeSha256&&Guard.Hash(c.TunnelConfig)==s.ConfigSha256,"configuration_drift");
  dynamic scheduler=Activator.CreateInstance(Type.GetTypeFromProgID("Schedule.Service"));scheduler.Connect();dynamic folder=scheduler.GetFolder("\\");dynamic task=folder.GetTask("SmartHome-WebCoRE-MCP");dynamic watchdog=folder.GetTask("SmartHome-WebCoRE-Watchdog");
  Guard.Require(Guard.Digest((string)task.Xml)==c.McpTaskXmlSha256&&Guard.Digest((string)watchdog.Xml)==c.WatchdogTaskXmlSha256,"task_drift");
  bool enabled=watchdog.Enabled;Guard.Require(enabled,"watchdog_disabled");
  var old=File.ReadAllText(c.TunnelConfig,Encoding.UTF8);var fromEncoded=s.CommandText;
  Guard.Require(!String.IsNullOrEmpty(fromEncoded)&&DecodePointer(fromEncoded)==ScriptPath(s.CommandRoot,s.Current),"command_binding");
  var toEncoded=EncodePointer(ScriptPath(target.Root,target),s.CommandEncoding);
  Guard.Require(old.Split(new[]{fromEncoded},StringSplitOptions.None).Length==2,"ambiguous_release_pointer");
  var backup=Path.Combine(c.Root,"recovery","tunnel-before-"+r.Id+".yaml");File.Copy(c.TunnelConfig,backup,false);
  s.Recovery="cutover_in_progress";Save(s); // durable marker before first production mutation
  try {
   watchdog.Enabled=false;task.Stop(0);WaitTunnel(false);
   if(r.Operation!="restart_mcp") AtomicText(c.TunnelConfig,old.Replace(fromEncoded,toEncoded));task.Run(null);WaitTunnel(true);VerifyRunningNode(r.Operation=="restart_mcp"?ScriptPath(s.CommandRoot,s.Current):ScriptPath(target.Root,target));
   // Process presence is a local gate; fresh ChatGPT end-to-end acceptance is separate.
   var previous=s.Current;var updated=new State{Current=target,Previous=r.Operation=="restart_mcp"?s.Previous:previous,CommandRoot=r.Operation=="restart_mcp"?s.CommandRoot:target.Root,CommandText=r.Operation=="restart_mcp"?s.CommandText:toEncoded,CommandEncoding=s.CommandEncoding,ConfigSha256=Guard.Hash(c.TunnelConfig),Recovery="clean"};Save(updated);
   return new { ok=true,currentCommit=target.Commit,localProcessVerified=true,endToEndVerified=false,rollbackCommit=r.Operation=="restart_mcp"?(s.Previous==null?null:s.Previous.Commit):s.Current.Commit };
  } catch {
   try { task.Stop(0);WaitTunnel(false);AtomicText(c.TunnelConfig,old);task.Run(null);WaitTunnel(true);VerifyRunningNode(ScriptPath(s.CommandRoot,s.Current));s.Recovery="clean";s.ConfigSha256=Guard.Hash(c.TunnelConfig);Save(s); }
   catch { s.Recovery="operator_recovery_required";Save(s); }
   throw;
  } finally { try{watchdog.Enabled=enabled;}catch{var recovery=GetState();recovery.Recovery="operator_recovery_required";Save(recovery);throw;} }
 }
 public const string LauncherText="'use strict';\n\nprocess.env.WEBCORE_WINDOWS_MANAGEMENT_READONLY = 'enabled';\n\nrequire('./server/index.js');\n";
 static string ScriptPath(string root,Release release) {
  Guard.Require(release.EntryPoint=="server/index.js"||release.EntryPoint=="windows-readonly-launcher.cjs","unsupported_entry_point");
  Guard.Require(release.Files.ContainsKey(release.EntryPoint),"missing_entry_point");return Path.Combine(root,release.EntryPoint.Replace('/','\\'));
 }
 public static string DecodePointer(string text) { return Path.GetFullPath(text.Replace("\\\\","\\").Replace('/','\\')); }
 public static string EncodePointer(string path,string encoding) {
  Guard.Full(path);if(encoding=="forward") return path.Replace('\\','/');if(encoding=="escaped") return path.Replace("\\","\\\\");Guard.Require(encoding=="backslash","unsupported_pointer_encoding");return path;
 }
 public static bool CommandMatches(string command,string script) {
  if(command==null) return false;return new[]{script,script.Replace('\\','/')}.Distinct().Any(p=>command.EndsWith(" "+p,StringComparison.OrdinalIgnoreCase)||command.EndsWith("\""+p+"\"",StringComparison.OrdinalIgnoreCase));
 }
 static void VerifyRunningNode(string script) {
  for(int i=0;i<30;i++) {
   var tunnels=new List<int>();foreach(var candidate in Process.GetProcessesByName("tunnel-client")){using(candidate){try{if(String.Equals(Pipe.Image((uint)candidate.Id),c.TunnelExe,StringComparison.OrdinalIgnoreCase))tunnels.Add(candidate.Id);}catch{if(candidate.HasExited)continue;throw new InvalidOperationException("process_inspection");}}}Guard.Require(tunnels.Count==1,"tunnel_identity");
   using(var search=new ManagementObjectSearcher("SELECT ExecutablePath,CommandLine,ParentProcessId FROM Win32_Process WHERE Name='node.exe'")) {
    int matched=0;foreach(ManagementObject process in search.Get()) {
     var command=process["CommandLine"] as string;var image=process["ExecutablePath"] as string;
     if(Convert.ToInt32(process["ParentProcessId"])==tunnels[0]&&String.Equals(image,c.NodePath,StringComparison.OrdinalIgnoreCase)&&CommandMatches(command,script))matched++;
    }
    if(matched==1) return;Guard.Require(matched<=1,"duplicate_mcp");
   }Thread.Sleep(1000);
  }throw new InvalidOperationException("running_payload_unverified");
 }
 static void AtomicText(string path,string text) { var temp=path+".vm-management.tmp";using(var f=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {var b=new UTF8Encoding(false).GetBytes(text);f.Write(b,0,b.Length);f.Flush(true);} File.Replace(temp,path,null); }
 static void WaitTunnel(bool running) {
  for(int i=0;i<30;i++) {int count=0;foreach(var p in Process.GetProcessesByName("tunnel-client")) { using(p) {try {if(String.Equals(Pipe.Image((uint)p.Id),c.TunnelExe,StringComparison.OrdinalIgnoreCase)) count++;}catch {if(p.HasExited)continue;throw new InvalidOperationException("process_inspection");}} }
   Guard.Require(count<=1,"duplicate_tunnel");if((running&&count==1)||(!running&&count==0)) return;Thread.Sleep(1000);
  }throw new InvalidOperationException("tunnel_state_timeout");
 }
 static void Operator() {
  Guard.Require(WindowsIdentity.GetCurrent().User.Value==c.OperatorSid&&new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),"operator_identity");
  Application.EnableVisualStyles();var form=new Form{Text="Smart Home — independent VM approval",Width=1000,Height=650};var list=new ListBox{Dock=DockStyle.Fill,Font=new System.Drawing.Font("Consolas",10)};var buttons=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=50};
  var bootstrap=new Button{Text="Queue initial deployment",Width=180};var refresh=new Button{Text="Refresh",Width=100};var approve=new Button{Text="Approve once",Width=140};var deny=new Button{Text="Deny",Width=100};buttons.Controls.AddRange(new Control[]{refresh,approve,deny,bootstrap});form.Controls.Add(list);form.Controls.Add(buttons);
  EventHandler reload=(sender,e)=>{try {var response=Pipe.Call(OperatorPipe,exe,c.ExeSha256,new { action="list" });list.Items.Clear();object records;if(response.TryGetValue("requests",out records)) foreach(var record in (object[])records) list.Items.Add(Guard.Json.Serialize(record));}catch {MessageBox.Show("Broker unavailable. Approvals were not issued.");}};
  bootstrap.Click+=(sender,e)=>{try{Pipe.Call(OperatorPipe,exe,c.ExeSha256,new{action="bootstrap"});reload(sender,e);}catch{MessageBox.Show("Initial request failed closed.");}};
  refresh.Click+=reload;approve.Click+=(sender,e)=>{if(list.SelectedItem==null)return;var item=Guard.Parse((string)list.SelectedItem);var prompt="Approve ONE execution on TERMINAL?\n\n"+Guard.Json.Serialize(item)+"\n\nThis may stop the MCP tunnel briefly. Verify operation, commit and SHA-256 against the reviewed change.";
   if(MessageBox.Show(prompt,"Scoped approval",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;try {Pipe.Call(OperatorPipe,exe,c.ExeSha256,new { action="approve",requestId=Guard.Text(item,"requestId") });reload(sender,e);}catch {MessageBox.Show("Approval failed closed.");}};
  deny.Click+=(sender,e)=>{if(list.SelectedItem==null)return;var item=Guard.Parse((string)list.SelectedItem);try {Pipe.Call(OperatorPipe,exe,c.ExeSha256,new { action="deny",requestId=Guard.Text(item,"requestId") });reload(sender,e);}catch {MessageBox.Show("Denial failed.");}};
  form.Load+=reload;Application.Run(form);
 }
}
}
