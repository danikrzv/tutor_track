import AppKit

// Render the existing TutorTrack T mark at native macOS icon sizes.
let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        let context = NSGraphicsContext(bitmapImageRep: bitmap)!
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
        let p = CGFloat(pixels)
        NSColor(calibratedRed: 0.39, green: 0.33, blue: 0.81, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: p*0.06, y: p*0.06, width: p*0.88, height: p*0.88), xRadius: p*0.20, yRadius: p*0.20).fill()
        NSColor.white.setFill()
        NSBezierPath(rect: NSRect(x: p*0.25, y: p*0.59, width: p*0.50, height: p*0.13)).fill()
        NSBezierPath(rect: NSRect(x: p*0.435, y: p*0.25, width: p*0.13, height: p*0.40)).fill()
        NSColor(calibratedRed: 0.84, green: 0.80, blue: 1, alpha: 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: p*0.67, y: p*0.25, width: p*0.12, height: p*0.12)).fill()
        NSGraphicsContext.restoreGraphicsState()
        let name = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: directory.appendingPathComponent(name))
    }
}
