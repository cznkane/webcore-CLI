# Loaded by the installer only; no passwords or generic privilege API is exposed through MCP.
if(-not ('SmartHomeWorkerRights' -as [type])){
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;using System.Security.Principal;
public static class SmartHomeWorkerRights{
 [StructLayout(LayoutKind.Sequential)]struct Attributes{public int Length;public IntPtr Root,Name;public uint Flags;public IntPtr Security,Qos;}
 [StructLayout(LayoutKind.Sequential)]struct Unicode{public ushort Length,Maximum;public IntPtr Buffer;}
 [DllImport("advapi32.dll")]static extern uint LsaOpenPolicy(IntPtr name,ref Attributes attrs,uint access,out IntPtr handle);
 [DllImport("advapi32.dll")]static extern uint LsaAddAccountRights(IntPtr policy,IntPtr sid,Unicode[] rights,uint count);
 [DllImport("advapi32.dll")]static extern uint LsaRemoveAccountRights(IntPtr policy,IntPtr sid,bool all,IntPtr rights,uint count);
 [DllImport("advapi32.dll")]static extern uint LsaClose(IntPtr handle);
 public static void Apply(string sid,bool remove){
  var attrs=new Attributes{Length=Marshal.SizeOf(typeof(Attributes))};IntPtr policy; if(LsaOpenPolicy(IntPtr.Zero,ref attrs,0x810,out policy)!=0)throw new InvalidOperationException("Worker logon policy unavailable");
  var identity=new SecurityIdentifier(sid);var bytes=new byte[identity.BinaryLength];identity.GetBinaryForm(bytes,0);var nativeSid=Marshal.AllocHGlobal(bytes.Length);Marshal.Copy(bytes,0,nativeSid,bytes.Length);
  try{
   if(remove){if(LsaRemoveAccountRights(policy,nativeSid,true,IntPtr.Zero,0)!=0)throw new InvalidOperationException("Worker logon rights cleanup failed");return;}
   var names=new[]{"SeBatchLogonRight","SeDenyInteractiveLogonRight","SeDenyRemoteInteractiveLogonRight","SeDenyNetworkLogonRight"};var rights=new Unicode[names.Length];
   try{for(int i=0;i<names.Length;i++)rights[i]=new Unicode{Length=(ushort)(names[i].Length*2),Maximum=(ushort)((names[i].Length+1)*2),Buffer=Marshal.StringToHGlobalUni(names[i])};if(LsaAddAccountRights(policy,nativeSid,rights,(uint)rights.Length)!=0)throw new InvalidOperationException("Restricted worker logon rights provisioning failed");}
   finally{foreach(var right in rights)if(right.Buffer!=IntPtr.Zero)Marshal.FreeHGlobal(right.Buffer);}
  }finally{Marshal.FreeHGlobal(nativeSid);LsaClose(policy);}
 }
}
'@
}
