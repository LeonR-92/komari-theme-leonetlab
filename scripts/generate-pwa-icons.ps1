param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$iconDirectory = Join-Path $ProjectRoot 'public\icons'
$sourcePath = Join-Path $iconDirectory 'pwa-512.png'
$sourceFile = [System.Drawing.Image]::FromFile($sourcePath)
$source = New-Object System.Drawing.Bitmap $sourceFile
$sourceFile.Dispose()

function New-ScaledPng {
    param(
        [int]$Size,
        [string]$OutputPath,
        [bool]$Maskable = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

        if ($Maskable) {
            $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#071121'))
            $logoSize = [int][Math]::Round($Size * 0.56)
            $offset = [int][Math]::Floor(($Size - $logoSize) / 2)
            $graphics.DrawImage($source, $offset, $offset, $logoSize, $logoSize)
        }
        else {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.DrawImage($source, 0, 0, $Size, $Size)
        }
    }
    finally {
        $graphics.Dispose()
    }

    try {
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $bitmap.Dispose()
    }
}

try {
    $appSizes = @(44, 55, 66, 88, 176, 192, 256, 512)
    foreach ($size in $appSizes) {
        New-ScaledPng -Size $size -OutputPath (Join-Path $iconDirectory "pwa-$size.png")
    }

    foreach ($size in @(192, 512)) {
        New-ScaledPng -Size $size -OutputPath (Join-Path $iconDirectory "pwa-maskable-$size.png") -Maskable $true
    }

    $icoSizes = @(16, 24, 32, 48, 64, 128, 256)
    $icoPngs = @()
    foreach ($size in $icoSizes) {
        $temporaryPath = Join-Path $iconDirectory ".favicon-$size.png"
        New-ScaledPng -Size $size -OutputPath $temporaryPath
        $icoPngs += ,([System.IO.File]::ReadAllBytes($temporaryPath))
        Remove-Item -LiteralPath $temporaryPath
    }

    $icoPath = Join-Path $ProjectRoot 'public\favicon.ico'
    $stream = [System.IO.File]::Create($icoPath)
    $writer = New-Object System.IO.BinaryWriter $stream
    try {
        $writer.Write([UInt16]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]$icoSizes.Count)

        $offset = 6 + (16 * $icoSizes.Count)
        for ($index = 0; $index -lt $icoSizes.Count; $index++) {
            $size = $icoSizes[$index]
            $png = $icoPngs[$index]
            $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
            $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]32)
            $writer.Write([UInt32]$png.Length)
            $writer.Write([UInt32]$offset)
            $offset += $png.Length
        }

        foreach ($png in $icoPngs) {
            $writer.Write($png)
        }
    }
    finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}
finally {
    $source.Dispose()
}

Write-Host 'Generated deterministic PWA PNG and multi-size ICO assets.'
