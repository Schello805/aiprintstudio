import AppKit
import CoreML
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

enum WorkerError: Error {
    case invalidArguments
    case noDepthResult
    case imageWriteFailed
}

func writeGrayPNG(_ values: [Float], width: Int, height: Int, to url: URL) throws {
    let sorted = values.filter(\.isFinite).sorted()
    let lowIndex = max(0, min(sorted.count - 1, Int(Double(sorted.count) * 0.01)))
    let highIndex = max(0, min(sorted.count - 1, Int(Double(sorted.count) * 0.99)))
    let minimum = sorted.isEmpty ? 0 : sorted[lowIndex]
    let maximum = sorted.isEmpty ? 1 : sorted[highIndex]
    let span = max(maximum - minimum, 0.000_001)
    let bytes = values.map { UInt8(max(0, min(255, (($0 - minimum) / span) * 255))) }
    guard let provider = CGDataProvider(data: Data(bytes) as CFData),
          let image = CGImage(
            width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 8,
            bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGBitmapInfo(rawValue: 0), provider: provider,
            decode: nil, shouldInterpolate: true, intent: .defaultIntent
          ),
          let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { throw WorkerError.imageWriteFailed }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw WorkerError.imageWriteFailed }
}

func extractPixelBufferFloats(_ pixelBuffer: CVPixelBuffer) -> (values: [Float], width: Int, height: Int)? {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return nil }
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let format = CVPixelBufferGetPixelFormatType(pixelBuffer)
    var values: [Float] = []
    values.reserveCapacity(width * height)
    if format == kCVPixelFormatType_OneComponent16Half || format == kCVPixelFormatType_DepthFloat16 || format == kCVPixelFormatType_DisparityFloat16 {
        for y in 0..<height {
            let row = baseAddress.advanced(by: y * bytesPerRow).assumingMemoryBound(to: UInt16.self)
            for x in 0..<width {
                let value = Float(Float16(bitPattern: row[x]))
                values.append(value.isFinite ? value : 0)
            }
        }
        return (values, width, height)
    }
    if format == kCVPixelFormatType_OneComponent32Float || format == kCVPixelFormatType_DepthFloat32 || format == kCVPixelFormatType_DisparityFloat32 {
        for y in 0..<height {
            let row = baseAddress.advanced(by: y * bytesPerRow).assumingMemoryBound(to: Float.self)
            for x in 0..<width {
                let value = row[x]
                values.append(value.isFinite ? value : 0)
            }
        }
        return (values, width, height)
    }
    return nil
}

func run() throws {
    guard CommandLine.arguments.count == 4 else { throw WorkerError.invalidArguments }
    let modelURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let inputURL = URL(fileURLWithPath: CommandLine.arguments[2])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[3])
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    let model = try MLModel(contentsOf: modelURL, configuration: configuration)
    let visionModel = try VNCoreMLModel(for: model)
    let request = VNCoreMLRequest(model: visionModel)
    request.imageCropAndScaleOption = .scaleFill
    try VNImageRequestHandler(url: inputURL).perform([request])

    for result in request.results ?? [] {
        if let feature = result as? VNCoreMLFeatureValueObservation,
           let array = feature.featureValue.multiArrayValue {
            let shape = array.shape.map(\.intValue)
            guard shape.count >= 2 else { continue }
            let height = shape[shape.count - 2], width = shape[shape.count - 1]
            let values = (0..<array.count).map { array[$0].floatValue }
            try writeGrayPNG(values, width: width, height: height, to: outputURL)
            return
        }
        if let pixelResult = result as? VNPixelBufferObservation {
            if let extracted = extractPixelBufferFloats(pixelResult.pixelBuffer) {
                try writeGrayPNG(extracted.values, width: extracted.width, height: extracted.height, to: outputURL)
                return
            }
            let ciImage = CIImage(cvPixelBuffer: pixelResult.pixelBuffer)
            let context = CIContext()
            guard let colorSpace = CGColorSpace(name: CGColorSpace.linearGray),
                  let image = context.createCGImage(ciImage, from: ciImage.extent, format: .L8, colorSpace: colorSpace),
                  let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, UTType.png.identifier as CFString, 1, nil)
            else { continue }
            CGImageDestinationAddImage(destination, image, nil)
            guard CGImageDestinationFinalize(destination) else { throw WorkerError.imageWriteFailed }
            return
        }
    }
    throw WorkerError.noDepthResult
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("DepthWorker: \(error)\n".utf8))
    exit(1)
}
