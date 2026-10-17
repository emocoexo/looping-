using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Text;
using System.Windows.Forms;

internal static class Launcher
{
    private static Process server;
    private static string address;
    private static NotifyIcon tray;
    private static readonly ManualResetEventSlim ready = new ManualResetEventSlim(false);
    private static readonly object logLock = new object();
    private static readonly StringBuilder errors = new StringBuilder();
    private static string logPath;
    private static void Log(string message)
    {
        lock (logLock)
        {
            try { if (logPath != null) File.AppendAllText(logPath, DateTime.Now.ToString("O") + " " + message + Environment.NewLine); }
            catch (Exception) { /* A logging failure must not prevent startup. */ }
        }
    }
    [STAThread]
    private static int Main(string[] args)
    {
        bool smokeTest = Array.IndexOf(args, "--smoke-test") >= 0;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            try
            {
                string logs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Loop Studio", "logs");
                Directory.CreateDirectory(logs);
                logPath = Path.Combine(logs, "launcher.log");
                File.WriteAllText(logPath, "Loop Studio launcher 2.0.1" + Environment.NewLine);
            }
            catch (Exception) { logPath = null; }
            string root = AppDomain.CurrentDomain.BaseDirectory;
            Log("Starting bundled server from " + root);
            var info = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"));
            info.Arguments = "\"" + Path.Combine(root, "app", "desktop", "server.mjs") + "\"";
            info.WorkingDirectory = Path.Combine(root, "app");
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            server = new Process { StartInfo = info };
            server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs data)
            {
                if (data.Data == null) { ready.Set(); return; }
                Log("stdout: " + data.Data);
                Uri candidate;
                if (Uri.TryCreate(data.Data.Trim(), UriKind.Absolute, out candidate) &&
                    candidate.Scheme == "http" && candidate.Host == "127.0.0.1" && candidate.Port > 0)
                {
                    address = candidate.GetLeftPart(UriPartial.Authority);
                    ready.Set();
                }
            };
            server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs data)
            {
                if (data.Data == null) return;
                Log("stderr: " + data.Data);
                lock (logLock)
                {
                    errors.AppendLine(data.Data);
                    if (errors.Length > 3000) errors.Remove(0, errors.Length - 3000);
                }
            };
            server.Start();
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();
            if (!ready.Wait(90000))
                throw new Exception("Server belum siap setelah 90 detik. Lihat detail pada log di bawah.");
            if (address == null)
            {
                // Drain redirected error events after process exit before reporting the failure.
                if (server.WaitForExit(2000)) server.WaitForExit();
                throw new Exception("Server lokal berhenti sebelum aplikasi siap.");
            }
            Log("Server ready: " + address);
            if (smokeTest)
            {
                using (var client = new System.Net.WebClient())
                {
                    client.Proxy = null;
                    if (!client.DownloadString(address + "/api/health").Contains("ok"))
                        throw new Exception("Health check failed.");
                }
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
            Log(error.ToString());
            string detail;
            lock (logLock) { detail = errors.ToString(); }
            string message = error.Message + (detail.Length > 0 ? "\n\n" + detail : "") +
                (logPath != null ? "\n\nLog: " + logPath : "");
            if (!smokeTest) MessageBox.Show(message, "Loop Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
        catch (Exception error) { Log("Stopping server: " + error.Message); }
        finally { server.Dispose(); server = null; }
    }
}
