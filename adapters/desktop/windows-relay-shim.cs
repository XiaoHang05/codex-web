using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;

public static class DesktopRelayShim
{
    // Windows CommandLineToArgvW-compatible quoting. No command shell is used.
    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"')
            {
                result.Append('\\', slashes * 2 + 1);
                result.Append('"');
            }
            else
            {
                result.Append('\\', slashes);
                result.Append(character);
            }
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static async Task CopyInput(Stream source, Stream destination)
    {
        try { await CopyFlushed(source, destination).ConfigureAwait(false); }
        catch (IOException) { }
        catch (ObjectDisposedException) { }
        finally { try { destination.Close(); } catch (IOException) { } }
    }

    private static async Task CopyFlushed(Stream source, Stream destination)
    {
        byte[] buffer = new byte[16384];
        int count;
        while ((count = await source.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) != 0)
        {
            await destination.WriteAsync(buffer, 0, count).ConfigureAwait(false);
            await destination.FlushAsync().ConfigureAwait(false);
        }
    }

    public static int Main(string[] arguments)
    {
        try
        {
            string node = Environment.GetEnvironmentVariable("CODEX_WEB_RELAY_NODE_BINARY");
            string entry = Environment.GetEnvironmentVariable("CODEX_WEB_RELAY_ENTRY");
            if (String.IsNullOrEmpty(node) || !Path.IsPathRooted(node) || !File.Exists(node))
                throw new InvalidOperationException("A valid absolute relay Node executable is required.");
            if (String.IsNullOrEmpty(entry) || !Path.IsPathRooted(entry) || !File.Exists(entry))
                throw new InvalidOperationException("A valid absolute relay entry script is required.");

            var command = new StringBuilder(Quote(entry));
            foreach (string argument in arguments) command.Append(" ").Append(Quote(argument));
            var start = new ProcessStartInfo(node, command.ToString());
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
            // .NET Framework creates the redirected stdin writer using the
            // console input encoding. Disable its preamble before creation.
            Console.InputEncoding = new UTF8Encoding(false);
            using (var process = Process.Start(start))
            {
                if (process == null) throw new InvalidOperationException("Relay process did not start.");
                Task input = CopyInput(Console.OpenStandardInput(), process.StandardInput.BaseStream);
                Task output = CopyFlushed(process.StandardOutput.BaseStream, Console.OpenStandardOutput());
                Task error = CopyFlushed(process.StandardError.BaseStream, Console.OpenStandardError());
                process.WaitForExit();
                Task.WaitAll(output, error);
                // Never wait for the caller's open stdin after the child exits.
                GC.KeepAlive(input);
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Desktop relay shim failed: " + error.Message);
            return 1;
        }
    }
}
