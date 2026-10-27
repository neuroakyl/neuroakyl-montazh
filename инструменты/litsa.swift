// Лица в кадре (macOS Vision) с трекингом: лицо находим детектором, дальше ведём трекером объектов кадр за кадром —
// он держит лицо и в профиль, и когда оно мелкое. Учитывает поворот видео и фото с телефона. Запускать через litsa.py.
//   swiftc -O litsa.swift -o litsa
//   ./litsa файл.mp4|.jpg [DETECT]   — детектор на каждом DETECT-м кадре (по умолчанию 3), трекер — на каждом
// Выход: {"w":..,"h":..,"fps":..,"tracks":[{"id":0,"boxes":[[t,x,y,w,h],…]},…]} — пиксели показанного кадра, начало сверху слева.
import AVFoundation
import ImageIO
import Vision

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: litsa FILE [DETECT]"); exit(1) }
let url = URL(fileURLWithPath: args[1])
let every = args.count > 2 ? max(1, Int(args[2]) ?? 3) : 3

func detect(_ h: VNImageRequestHandler) -> [CGRect] {
    let req = VNDetectFaceRectanglesRequest()
    req.revision = VNDetectFaceRectanglesRequestRevision3
    try? h.perform([req])
    return (req.results ?? []).map { $0.boundingBox } // нормированные, начало снизу слева, в повёрнутом кадре
}
func iou(_ a: CGRect, _ b: CGRect) -> Double {
    let i = a.intersection(b)
    if i.isNull { return 0 }
    let x = Double(i.width * i.height)
    return x / (Double(a.width * a.height + b.width * b.height) - x + 1e-9)
}
// трекеру мелкое лицо не удержать: ведём область в ZOOM раз больше (голова с плечами), лицо — её центр
let ZOOM: CGFloat = 2.2
func grow(_ b: CGRect) -> CGRect {
    let w = min(1, b.width * ZOOM), h = min(1, b.height * ZOOM)
    return CGRect(x: min(max(0, b.midX - w / 2), 1 - w), y: min(max(0, b.midY - h / 2), 1 - h), width: w, height: h)
}
func shrink(_ b: CGRect) -> CGRect {
    CGRect(x: b.midX - b.width / ZOOM / 2, y: b.midY - b.height / ZOOM / 2, width: b.width / ZOOM, height: b.height / ZOOM)
}
func px(_ b: CGRect, _ W: Double, _ H: Double) -> String {
    String(format: "%.1f,%.1f,%.1f,%.1f", b.minX * W, (1 - b.maxY) * H, b.width * W, b.height * H)
}

let ext = url.pathExtension.lowercased()
if ["jpg", "jpeg", "png", "heic", "webp"].contains(ext) {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { exit(2) }
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let raw = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    var W = Double(img.width), H = Double(img.height)
    if raw >= 5 { swap(&W, &H) } // 5–8 — повёрнуто на 90°
    let faces = detect(VNImageRequestHandler(cgImage: img, orientation: CGImagePropertyOrientation(rawValue: raw) ?? .up, options: [:]))
    let tr = faces.enumerated().map { "{\"id\":\($0.offset),\"boxes\":[[0,\(px($0.element, W, H))]]}" }
    print("{\"w\":\(Int(W)),\"h\":\(Int(H)),\"fps\":0,\"tracks\":[\(tr.joined(separator: ","))]}")
    exit(0)
}

let asset = AVURLAsset(url: url)
let sema = DispatchSemaphore(value: 0)
var track: AVAssetTrack?
var fps: Float = 30
var size = CGSize(width: 1080, height: 1920)
var tf = CGAffineTransform.identity
Task {
    track = try? await asset.loadTracks(withMediaType: .video).first
    if let t = track {
        fps = (try? await t.load(.nominalFrameRate)) ?? 30
        size = (try? await t.load(.naturalSize)) ?? size
        tf = (try? await t.load(.preferredTransform)) ?? .identity
    }
    sema.signal()
}
sema.wait()
guard let vt = track, let reader = try? AVAssetReader(asset: asset) else { exit(2) }
let ang = atan2(tf.b, tf.a) * 180 / .pi
let ori: CGImagePropertyOrientation = abs(ang - 90) < 1 ? .right : abs(ang + 90) < 1 ? .left : abs(abs(ang) - 180) < 1 ? .down : .up
var W = Double(size.width), H = Double(size.height)
if ori == .right || ori == .left { swap(&W, &H) }

let out = AVAssetReaderTrackOutput(track: vt, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
out.alwaysCopiesSampleData = false
reader.add(out)
reader.startReading()

final class Face { let id: Int; var obs: VNDetectedObjectObservation; var req: VNTrackObjectRequest; var boxes: [String] = []; var lost = 0
    init(_ id: Int, _ o: VNDetectedObjectObservation) { self.id = id; obs = o; req = Face.make(o) }
    static func make(_ o: VNDetectedObjectObservation) -> VNTrackObjectRequest {
        let r = VNTrackObjectRequest(detectedObjectObservation: o); r.trackingLevel = .accurate; return r
    }
    // детектор поправил рамку — новый запрос (сброс накопленного дрейфа трекера)
    func reset(_ o: VNDetectedObjectObservation) { obs = o; req = Face.make(o); lost = 0 } }
var live: [Face] = [], done: [Face] = []
var nextId = 0
let seq = VNSequenceRequestHandler()
var n = 0
while let sample = out.copyNextSampleBuffer() {
    defer { n += 1 }
    guard let pb = CMSampleBufferGetImageBuffer(sample) else { continue }
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
    // 1) трекер ведёт каждое известное лицо
    for f in live {
        f.req.inputObservation = f.obs // один запрос на всё время жизни лица — так трекер помнит, что ведёт
        try? seq.perform([f.req], on: pb, orientation: ori)
        if let o = f.req.results?.first as? VNDetectedObjectObservation, o.confidence > 0.1 { f.obs = o; f.lost = 0 } else { f.lost += 1 }
    }
    // 2) детектор: новые лица и подправка трекеров (трекер со временем «съезжает»)
    if n % every == 0 {
        // пары «дорожка — найденное лицо» один к одному, сначала самые близкие: два лица рядом (ребёнок на плечах) не сливаются
        let dets = detect(VNImageRequestHandler(cvPixelBuffer: pb, orientation: ori, options: [:]))
        var pairs: [(Double, Int, Int)] = []
        for (di, d) in dets.enumerated() {
            for (fi, f) in live.enumerated() {
                let a = shrink(f.obs.boundingBox)
                let near = Double(hypot(a.midX - d.midX, a.midY - d.midY) / max(a.width, d.width))
                if iou(a, d) > 0.2 || near < 1.5 { pairs.append((near, di, fi)) }
            }
        }
        var usedD = Set<Int>(), usedF = Set<Int>()
        for (_, di, fi) in pairs.sorted(by: { $0.0 < $1.0 }) where !usedD.contains(di) && !usedF.contains(fi) {
            live[fi].reset(VNDetectedObjectObservation(boundingBox: grow(dets[di]))); usedD.insert(di); usedF.insert(fi)
        }
        for (di, d) in dets.enumerated() where !usedD.contains(di) {
            live.append(Face(nextId, VNDetectedObjectObservation(boundingBox: grow(d)))); nextId += 1
        }
    }
    // 3) потерянные дольше ~1 с — закрыть дорожку
    for f in live where f.lost == 0 { f.boxes.append(String(format: "[%.3f,", t) + px(shrink(f.obs.boundingBox), W, H) + "]") }
    done += live.filter { Double($0.lost) > Double(fps) }
    live.removeAll { Double($0.lost) > Double(fps) }
}
let all = (done + live).filter { !$0.boxes.isEmpty }.sorted { $0.id < $1.id }
let tr = all.map { "{\"id\":\($0.id),\"boxes\":[\($0.boxes.joined(separator: ","))]}" }
print("{\"w\":\(Int(W)),\"h\":\(Int(H)),\"fps\":\(fps),\"tracks\":[\(tr.joined(separator: ","))]}")
