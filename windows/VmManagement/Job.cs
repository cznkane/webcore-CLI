using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
namespace SmartHome.VmManagement {
public static class Job {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUP { public int cb;public string reserved,desktop,title;public uint x,y,width,height,xchars,ychars,fill,flags;public ushort show,reserved2;public IntPtr reservedPtr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS { public IntPtr process,thread; public uint pid,tid; }
 [StructLayout(LayoutKind.Sequential)] struct BASIC { public long processTime,jobTime; public uint flags; public UIntPtr min,max;public uint active;public UIntPtr affinity;public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct IO { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
 [StructLayout(LayoutKind.Sequential)] struct LIMIT { public BASIC basic;public IO io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int cls,ref LIMIT limit,uint size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string exe,StringBuilder args,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref STARTUP startup,out PROCESS process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
 [StructLayout(LayoutKind.Sequential)] struct ACCOUNT {public long user,kernel,periodUser,periodKernel;public uint faults,total,active,terminated;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int cls,out ACCOUNT info,uint size,IntPtr returned);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint exit);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint exit);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint exit);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 public static object Run(string node,string cwd,string args,int timeout,string temp) {
  Guard.Full(node);Guard.NoReparse(node);Guard.NoReparse(cwd);
  // args are constructed exclusively from fixed operation plans, never supplied by IPC.
  Guard.Require(args=="--test"||(args.StartsWith("--check \"")&&args.EndsWith("\"")),"invalid_plan");
  var watch=Stopwatch.StartNew(); var job=CreateJobObject(IntPtr.Zero,null);Guard.Require(job!=IntPtr.Zero,"job_create");
  PROCESS p=new PROCESS();IntPtr env=IntPtr.Zero;
  try {
   var limit=new LIMIT{basic=new BASIC{flags=0x2000|0x8|0x100|0x200,active=32},processMemory=new UIntPtr(1073741824),jobMemory=new UIntPtr(2147483648)};
   Guard.Require(SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(typeof(LIMIT))),"job_limits");
   // No inherited environment, handles, NODE_OPTIONS, credentials or user profile.
   var environment="PATH="+Path.GetDirectoryName(node)+"\0SystemRoot="+Environment.GetFolderPath(Environment.SpecialFolder.Windows)+"\0TEMP="+temp+"\0TMP="+temp+"\0\0";
   env=Marshal.StringToHGlobalUni(environment);var si=new STARTUP{cb=Marshal.SizeOf(typeof(STARTUP))};
   Guard.Require(CreateProcess(node,new StringBuilder("\""+node+"\" "+args),IntPtr.Zero,IntPtr.Zero,false,0x4|0x400|0x8000000,env,cwd,ref si,out p),"process_start");
   // Child cannot execute until the job owns it. Failure kills the still-suspended process.
   Guard.Require(AssignProcessToJobObject(job,p.process),"job_assign");Guard.Require(ResumeThread(p.thread)!=UInt32.MaxValue,"process_resume");
   bool timed=WaitForSingleObject(p.process,(uint)timeout)==0x102;
   uint code; Guard.Require(GetExitCodeProcess(p.process,out code),"exit_code");
   Guard.Require(TerminateJobObject(job,timed?124u:0u),"job_terminate");
   Guard.Require(WaitForSingleObject(p.process,5000)==0,"process_termination");
   ACCOUNT accounting;bool empty=false;for(int i=0;i<100;i++){Guard.Require(QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero),"job_accounting");if(accounting.active==0){empty=true;break;}System.Threading.Thread.Sleep(50);}Guard.Require(empty,"descendant_termination");
   return new { ok=!timed&&code==0,exitCode=timed?124:code,durationMs=watch.ElapsedMilliseconds,timedOut=timed,outputSuppressed=true };
  } finally {
   if(p.process!=IntPtr.Zero) { TerminateProcess(p.process,125);CloseHandle(p.process); }
   if(p.thread!=IntPtr.Zero) CloseHandle(p.thread);
   CloseHandle(job); // KILL_ON_JOB_CLOSE contains descendants on normal exit, timeout AND worker crash.
   if(env!=IntPtr.Zero) Marshal.FreeHGlobal(env);
  }
 }
}
}
