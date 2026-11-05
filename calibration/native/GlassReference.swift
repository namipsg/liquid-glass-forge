import SwiftUI
import UIKit
import CryptoKit

@main struct GlassReferenceApp: App {
    var body: some Scene { WindowGroup { ReferenceView() } }
}
struct ReferenceView: View {
    @State private var variant = "Clear"
    @State private var appearance = "Light"
    @State private var interactive = true
    @State private var center = CGPoint(x: 160, y: 160)
    @State private var dragOrigin: CGPoint?
    @Environment(\.accessibilityReduceTransparency) private var reducedTransparency
    @Environment(\.accessibilityReduceMotion) private var reducedMotion
    private var material: Glass { variant == "Clear" ? .clear : .regular }
    private var backdropURL: URL { Bundle.main.url(forResource: "backdrop", withExtension: "png")! }
    private var fingerprint: String { (try? SHA256.hash(data: Data(contentsOf: backdropURL)).map { String(format: "%02x", $0) }.joined()) ?? "unavailable" }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Native material reference").font(.title2.bold())
                Text("Apple SwiftUI glassEffect · iOS \(UIDevice.current.systemVersion)").font(.caption).foregroundStyle(.secondary)
                Picker("Material", selection: $variant) { Text("Clear").tag("Clear"); Text("Regular").tag("Regular") }.pickerStyle(.segmented)
                Picker("Appearance", selection: $appearance) { Text("Light").tag("Light"); Text("Dark").tag("Dark") }.pickerStyle(.segmented)
                ZStack(alignment: .topLeading) {
                    Image(uiImage: UIImage(contentsOfFile: backdropURL.path)!).resizable().interpolation(.high).frame(width: 320, height: 320)
                    Text("Glass").font(.system(size: 14, weight: .medium))
                        .frame(width: 200, height: 120)
                        .glassEffect(material.interactive(interactive), in: Capsule())
                        .position(center)
                        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("stage"))
                            .onChanged { value in
                                if dragOrigin == nil { dragOrigin = center }
                                center = CGPoint(x: min(220, max(100, dragOrigin!.x + value.translation.width)), y: min(260, max(60, dragOrigin!.y + value.translation.height)))
                            }.onEnded { _ in dragOrigin = nil })
                }.frame(width: 320, height: 320).coordinateSpace(name: "stage").clipped()
                Toggle("Native interaction", isOn: $interactive)
                HStack {
                    Button("Center") { center = CGPoint(x: 160, y: 160) }
                    Spacer()
                    Button("Replay 2s sweep") {
                        guard !reducedMotion else { return }
                        center = CGPoint(x: 110, y: 160)
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(200))
                            withAnimation(.linear(duration: 2)) { center = CGPoint(x: 210, y: 160) }
                        }
                    }.disabled(reducedMotion)
                }.buttonStyle(.bordered)
                Text("320 × 320 pt source · 200 × 120 pt capsule\nCorner markers register the screenshot crop.").font(.caption).foregroundStyle(.secondary)
                Text("Reduce transparency: \(reducedTransparency ? "on" : "off") · Reduce motion: \(reducedMotion ? "on" : "off")").font(.caption2)
                Text("Source SHA-256: \(fingerprint)").font(.system(size: 9, design: .monospaced)).textSelection(.enabled)
                Text("Independent calibration utility. No device settings are changed.").font(.caption2).foregroundStyle(.secondary)
            }.padding(24).frame(maxWidth: 400)
        }.preferredColorScheme(appearance == "Light" ? .light : .dark)
    }
}
