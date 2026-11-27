// Текст в кадре (macOS Vision OCR) — для автопроверки монтажа (tekst.py, аудит 24.11.2026).
//   swiftc -O tekst.swift -o .tekst-bin        (собирает tekst.py сам при первом запуске)
//   ./tekst файл.mp4 [ШАГ_С]              — кадр каждые ШАГ с (по умолчанию 0.5)
// Выход: {"w":..,"h":..,"dur":..,"frames":[{"t":..,"boxes":[["текст",x,y,w,h,conf],…]},…]}
// Пиксели показанного кадра, начало сверху слева.
import AVFoundation
import Vision

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: tekst FILE [STEP]"); exit(1) }
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let step = args.count > 2 ? max(0.1, Double(args[2]) ?? 0.5) : 0.5
let dur = CMTimeGetSeconds(asset.duration)
guard let track = asset.tracks(withMediaType: .video).first else { print("нет видео"); exit(1) }
let size = track.naturalSize.applying(track.preferredTransform)
let W = abs(size.width), H = abs(size.height)

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

func esc(_ s: String) -> String {
    s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        .replacingOccurrences(of: "\n", with: " ")
}

var out: [String] = []
var t = 0.0
while t < dur {
    if let img = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.recognitionLanguages = ["ru-RU", "en-US"]
        req.usesLanguageCorrection = false
        try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
        var boxes: [String] = []
        for r in req.results ?? [] {
            guard let c = r.topCandidates(1).first else { continue }
            let b = r.boundingBox // нормированные, начало снизу слева
            let x = b.minX * W, y = (1 - b.maxY) * H, w = b.width * W, h = b.height * H
            boxes.append(String(format: "[\"%@\",%.0f,%.0f,%.0f,%.0f,%.2f]", esc(c.string), x, y, w, h, c.confidence))
        }
        out.append(String(format: "{\"t\":%.2f,\"boxes\":[%@]}", t, boxes.joined(separator: ",")))
    }
    t += step
}
print(String(format: "{\"w\":%.0f,\"h\":%.0f,\"dur\":%.2f,\"frames\":[%@]}", W, H, dur, out.joined(separator: ",")))
