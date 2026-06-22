param([int]$Port = 4173)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8' }
$listener.Start()
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $request = $reader.ReadLine()
      while ($reader.ReadLine()) { }
      $target = if ($request -match '^GET\s+([^\s]+)') { $Matches[1] } else { '/' }
      $relative = [Uri]::UnescapeDataString(($target -split '\?')[0].TrimStart('/'))
      if (-not $relative) { $relative = 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
      if ($path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
        $body = [IO.File]::ReadAllBytes($path)
        $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
        $contentType = if ($types.ContainsKey($extension)) { $types[$extension] } else { 'application/octet-stream' }
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
      } else {
        $body = [Text.Encoding]::UTF8.GetBytes('Not found')
        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      }
      $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
