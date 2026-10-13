using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

namespace SmartHome.VmManagement {
public static class Guard {
 public static JavaScriptSerializer Json { get {return new JavaScriptSerializer { MaxJsonLength = 65536, RecursionLimit = 12 };} }
 public static string Hash(string path) { using(var s=File.OpenRead(path)) using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(s)).Replace("-", "").ToLowerInvariant(); }
 public static string Digest(string value) { using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-", "").ToLowerInvariant(); }
 public static void Require(bool ok, string code) { if(!ok) throw new InvalidOperationException(code); }
 public static bool Hex(string value,int length) { return value!=null && Regex.IsMatch(value,"\\A[a-f0-9]{"+length+"}\\z"); }
 public static string Id() { var b=new byte[24]; using(var rng=RandomNumberGenerator.Create()) rng.GetBytes(b); return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant(); }
 public static string Full(string path) { Require(!String.IsNullOrEmpty(path)&&Regex.IsMatch(path,@"\A[A-Za-z]:\\")&&!path.Substring(2).Contains(":")&&!path.Contains("\""),"invalid_path"); var f=Path.GetFullPath(path); Require(String.Equals(f.TrimEnd('\\'),path.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase),"noncanonical_path"); return f; }
 public static void NoReparse(string path) { var p=Full(path); while(!String.IsNullOrEmpty(p)) { Require((File.GetAttributes(p)&FileAttributes.ReparsePoint)==0,"reparse_rejected"); p=Path.GetDirectoryName(p); } }
 public static void Protected(string path, string readerSid=null) {
  NoReparse(path);
  FileSystemSecurity acl=Directory.Exists(path)?(FileSystemSecurity)Directory.GetAccessControl(path):File.GetAccessControl(path);
  var owner=(SecurityIdentifier)acl.GetOwner(typeof(SecurityIdentifier));
  Require(owner.Value=="S-1-5-18"||owner.Value=="S-1-5-32-544","untrusted_owner");
  foreach(FileSystemAccessRule r in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
   if(r.AccessControlType!=AccessControlType.Allow) continue;
   var sid=((SecurityIdentifier)r.IdentityReference).Value;
   if(sid=="S-1-5-18"||sid=="S-1-5-32-544") continue;
   var write=FileSystemRights.Write|FileSystemRights.Delete|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership|FileSystemRights.DeleteSubdirectoriesAndFiles;
   Require((r.FileSystemRights&write)==0,"mutable_path");
   Require(readerSid!=null&&sid==readerSid,"unexpected_reader");
  }
 }
 public static Dictionary<string,object> Parse(string text) { var v=Json.DeserializeObject(text) as Dictionary<string,object>; Require(v!=null,"invalid_object"); return v; }
 public static string Text(Dictionary<string,object> v,string key) { object o; Require(v.TryGetValue(key,out o)&&o is string,"invalid_field"); return (string)o; }
 public static void Keys(Dictionary<string,object> v,params string[] keys) { Require(v.Keys.OrderBy(x=>x).SequenceEqual(keys.OrderBy(x=>x)),"unexpected_fields"); }
 public static T Read<T>(string path) { return Json.Deserialize<T>(File.ReadAllText(path,Encoding.UTF8)); }
 public static void Write(string path,object value) { var temp=path+".tmp"; using(var f=new FileStream(temp,FileMode.Create,FileAccess.Write,FileShare.None)) { var b=Encoding.UTF8.GetBytes(Json.Serialize(value)); f.Write(b,0,b.Length); f.Flush(true); } if(File.Exists(path)) File.Replace(temp,path,null); else File.Move(temp,path); }
 public static void Audit(string root,string id,string operation,string outcome,string digest) {
  Require(Regex.IsMatch(id,@"\A[a-f0-9]{48}\z")&&(Host.Operations.Contains(operation)||operation=="ipc_request")&&Hex(digest,64),"invalid_audit");
  var dir=Path.Combine(root,"audit"); Protected(dir);
  var file=Path.Combine(dir,DateTime.UtcNow.ToString("yyyy-MM-dd")+".jsonl");
  if(File.Exists(file)) Protected(file);
  using(var f=new FileStream(file,FileMode.Append,FileAccess.Write,FileShare.Read)) { var b=Encoding.UTF8.GetBytes(Json.Serialize(new { timestamp=DateTime.UtcNow.ToString("o"),requestId=id,operation=operation,outcome=outcome,releaseSha256=digest })+"\n"); f.Write(b,0,b.Length); f.Flush(true); }
  // No automatic deletion: retain durable metadata. Disk-space exhaustion fails closed.
 }
}
public static class Pipe {
 [StructLayout(LayoutKind.Sequential)] struct SA { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)]public bool inherit; }
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string s,uint revision,out IntPtr d,out uint size);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafePipeHandle CreateNamedPipe(string n,uint open,uint mode,uint instances,uint output,uint input,uint timeout,ref SA sa);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeClientProcessId(SafePipeHandle h,out uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeServerProcessId(SafePipeHandle h,out uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr h,int flags,StringBuilder path,ref int size);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 public static NamedPipeServerStream Server(string name,string sid) {
  Guard.Require(Regex.IsMatch(name,@"\ASmartHome-WebCoRE-[A-Za-z]+\z"),"invalid_pipe");
  IntPtr d;uint size; Guard.Require(ConvertStringSecurityDescriptorToSecurityDescriptor("D:P(A;;GA;;;SY)(A;;GA;;;"+sid+")",1,out d,out size),"pipe_security");
  try { var sa=new SA{length=Marshal.SizeOf(typeof(SA)),descriptor=d,inherit=false};
   // One persistent instance: squatting and competing server instances fail closed.
   var h=CreateNamedPipe(@"\\.\pipe\"+name,3|0x80000,8,1,65536,4096,5000,ref sa);
   Guard.Require(!h.IsInvalid,"pipe_create_failed"); return new NamedPipeServerStream(PipeDirection.InOut,false,false,h);
  } finally { LocalFree(d); }
 }
 static string Image(uint pid) { var h=OpenProcess(0x1000,false,pid); Guard.Require(h!=IntPtr.Zero,"peer_process"); try { var b=new StringBuilder(32768); int n=b.Capacity; Guard.Require(QueryFullProcessImageName(h,0,b,ref n),"peer_image"); return b.ToString(); } finally { CloseHandle(h); } }
 public static string Peer(NamedPipeServerStream p,string expectedImage,string expectedDigest) {
  uint pid; Guard.Require(GetNamedPipeClientProcessId(p.SafePipeHandle,out pid),"peer_pid");
  string sid=null; p.RunAsClient(()=>{using(var id=WindowsIdentity.GetCurrent(true)) { Guard.Require(id!=null,"peer_token"); sid=id.User.Value; }});
  var image=Image(pid); Guard.Require(String.Equals(image,expectedImage,StringComparison.OrdinalIgnoreCase)&&Guard.Hash(image)==expectedDigest,"peer_identity"); return sid;
 }
 static string ProcessSid(uint pid) { var process=OpenProcess(0x1000,false,pid);Guard.Require(process!=IntPtr.Zero,"server_process");IntPtr token=IntPtr.Zero;try {Guard.Require(OpenProcessToken(process,8,out token),"server_token");using(var id=new WindowsIdentity(token)) return id.User.Value;}finally{if(token!=IntPtr.Zero)CloseHandle(token);CloseHandle(process);} }
 public static Dictionary<string,object> Call(string name,string image,string digest,object request,int timeout=10000,string expectedServerSid="S-1-5-18") {
  using(var p=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.None,TokenImpersonationLevel.Identification)) {
   p.Connect(5000); uint pid; Guard.Require(GetNamedPipeServerProcessId(p.SafePipeHandle,out pid),"server_pid"); Guard.Require(ProcessSid(pid)==expectedServerSid,"server_sid");var actual=Image(pid); Guard.Require(String.Equals(actual,image,StringComparison.OrdinalIgnoreCase)&&Guard.Hash(actual)==digest,"server_identity");
   using(var timer=new Timer(_=>p.Dispose(),null,timeout,Timeout.Infinite)) { Send(p,request); return Receive(p,65536); }
  }
 }
 public static Dictionary<string,object> Receive(Stream s,int max=4096) { var h=Read(s,4); int n=BitConverter.ToInt32(h,0); Guard.Require(n>=2&&n<=max,"frame_limit"); return Guard.Parse(new UTF8Encoding(false,true).GetString(Read(s,n))); }
 static byte[] Read(Stream s,int n) { var b=new byte[n];int count=0;while(count<n) { int k=s.Read(b,count,n-count); Guard.Require(k>0,"frame_eof");count+=k;}return b; }
 public static void Send(Stream s,object obj) { var b=Encoding.UTF8.GetBytes(Guard.Json.Serialize(obj)); Guard.Require(b.Length<=65536,"response_limit");var h=BitConverter.GetBytes(b.Length);s.Write(h,0,4);s.Write(b,0,b.Length);s.Flush(); }
}
}
