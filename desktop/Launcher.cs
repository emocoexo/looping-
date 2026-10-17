using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Launcher
{
    private static Process server;
    private static string address;
    private static NotifyIcon tray;
    [STAThread]
    private static int Main(string[] args)
    {
        bool smokeTest = Array.IndexOf(args, "--smoke-test") >= 0;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            var info = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"));
            info.Arguments = "\"" + Path.Combine(root, "app", "desktop", "server.mjs") + "\"";
            info.WorkingDirectory = Path.Combine(root, "app");
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            server = Process.Start(info);
            var errorTask = server.StandardError.ReadToEndAsync();
            var ready = server.StandardOutput.ReadLineAsync();
            if (!ready.Wait(20000) || ready.Result == null || !ready.Result.StartsWith("http://127.0.0.1:"))
                throw new Exception("Server video belum dapat dijalankan. Coba pasang ulang Loop Studio.");
            address = ready.Result;
            if (smokeTest)
            {
                using (var client = new System.Net.WebClient())
                    if (!client.DownloadString(address + "/api/health").Contains("ok"))
                        throw new Exception("Health check failed.");
                return 0;
            }
            var menu = new ContextMenuStrip();
            menu.Items.Add("Buka Loop Studio", null, delegate { OpenBrowser(); });
            menu.Items.Add("Keluar", null, delegate { Application.Exit(); });
            tray = new NotifyIcon { Icon = SystemIcons.Application, Text = "Loop Studio", Visible = true, ContextMenuStrip = menu };
            tray.DoubleClick += delegate { OpenBrowser(); };
            Application.ApplicationExit += delegate { StopServer(); };
            OpenBrowser();
            Application.Run();
            return 0;
        }
        catch (Exception error)
        {
            if (!smokeTest) MessageBox.Show(error.Message, "Loop Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally { StopServer(); if (tray != null) tray.Dispose(); }
    }
    private static void OpenBrowser()
    {
        Process.Start(new ProcessStartInfo(address) { UseShellExecute = true });
    }
    private static void StopServer()
    {
        if (server == null) return;
        try
        {
            if (!server.HasExited)
            {
                var stop = Process.Start(new ProcessStartInfo("taskkill.exe", "/PID " + server.Id + " /T /F") { UseShellExecute = false, CreateNoWindow = true });
                stop.WaitForExit(5000);
            }
        }
        catch (InvalidOperationException) { }
        finally { server.Dispose(); server = null; }
    }
}
