// Вырезать главный предмет или человека с картинки (macOS 14+, Vision «поднять объект», как в Фото). Запускать через oblozhka.py.
//   swiftc -O vyrezat.swift -o vyrezat
//   ./vyrezat ВХОД.jpg ВЫХОД.png      — PNG с прозрачным фоном, обрезан по предмету
//   ./vyrezat --face КАРТИНКА.png     — самое крупное лицо: {"w":..,"h":..,"face":[x,y,w,h]} (доли, начало сверху слева) или "face":null
// Выход в консоль: {"w":..,"h":..,"n":<сколько объектов нашлось>}
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: vyrezat IN OUT.png | --face IMG"); exit(1) }
if args[1] == "--face" {
    guard let img = CIImage(contentsOf: URL(fileURLWithPath: args[2])) else { print("{\"error\":\"не открылась картинка\"}"); exit(2) }
    let r = VNDetectFaceRectanglesRequest()
    try? VNImageRequestHandler(ciImage: img).perform([r])
    let w = Int(img.extent.width), h = Int(img.extent.height)
    if let f = (r.results ?? []).max(by: { $0.boundingBox.width < $1.boundingBox.width })?.boundingBox {
        print("{\"w\":\(w),\"h\":\(h),\"face\":[\(f.minX),\(1 - f.maxY),\(f.width),\(f.height)]}")
    } else { print("{\"w\":\(w),\"h\":\(h),\"face\":null}") }
    exit(0)
}
guard let src = CIImage(contentsOf: URL(fileURLWithPath: args[1]), options: [.applyOrientationProperty: true]) else {
    print("{\"error\":\"не открылась картинка\"}"); exit(2)
}
let handler = VNImageRequestHandler(ciImage: src)
let req = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([req]) } catch { print("{\"error\":\"\(error.localizedDescription)\"}"); exit(3) }
guard let res = req.results?.first, !res.allInstances.isEmpty else { print("{\"error\":\"предмет не найден\"}"); exit(4) }
// все найденные объекты вместе, обрезка по их рамке
let buf = try res.generateMaskedImage(ofInstances: res.allInstances, from: handler, croppedToInstancesExtent: true)
let out = CIImage(cvPixelBuffer: buf)
let ctx = CIContext()
guard let cg = ctx.createCGImage(out, from: out.extent) else { exit(5) }
let rep = NSBitmapImageRep(cgImage: cg)
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("{\"w\":\(cg.width),\"h\":\(cg.height),\"n\":\(res.allInstances.count)}")
