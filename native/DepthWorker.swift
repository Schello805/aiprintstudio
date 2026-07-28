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
    let minimum = values.min() ?? 0
    let maximum = values.max() ?? 1
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
