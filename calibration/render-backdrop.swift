import AppKit
let output = CommandLine.arguments[1]
let image = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 480, pixelsHigh: 480, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: image)
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> NSColor { NSColor(srgbRed:r,green:g,blue:b,alpha:1) }
color(0.88,0.94,0.89).setFill(); NSRect(x:0,y:0,width:480,height:480).fill()
let colors:[NSColor] = [color(0.13,0.31,0.40),color(0.17,0.61,0.54),color(0.93,0.72,0.40),color(0.78,0.35,0.37),color(0.35,0.41,0.74),color(0.74,0.85,0.62)]
for (i,c) in colors.enumerated(){c.setFill();NSRect(x:i*80,y:0,width:80,height:480).fill()}
color(0.93,0.96,0.94).setStroke()
for x in stride(from:16,through:464,by:16){let line=NSBezierPath();line.move(to:NSPoint(x:x,y:0));line.line(to:NSPoint(x:x,y:480));line.lineWidth=1;line.stroke()}
for y in stride(from:16,through:464,by:16){let line=NSBezierPath();line.move(to:NSPoint(x:0,y:y));line.line(to:NSPoint(x:480,y:y));line.lineWidth=1;line.stroke()}
let attrs:[NSAttributedString.Key:Any] = [.font:NSFont.systemFont(ofSize:58,weight:.semibold),.foregroundColor:color(0.02,0.10,0.10)]
("Aa 0123" as NSString).draw(at:NSPoint(x:40,y:250),withAttributes:attrs)
("LIGHT / GLASS" as NSString).draw(at:NSPoint(x:40,y:150),withAttributes:[.font:NSFont.monospacedSystemFont(ofSize:31,weight:.medium),.foregroundColor:NSColor.white])
for y in [109,117,125]{NSColor.black.setFill();NSRect(x:40,y:y,width:400,height:3).fill()}
// Four exact corner markers register a physical screenshot without guessing crop.
NSColor(srgbRed:1,green:0,blue:1,alpha:1).setFill()
for x in [0,472]{for y in [0,472]{NSRect(x:x,y:y,width:8,height:8).fill()}}
NSGraphicsContext.restoreGraphicsState()
try image.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:output))
