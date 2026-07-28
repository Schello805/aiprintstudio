import Foundation
import RealityKit

@main
struct ObjectCaptureWorker {
    static func main() async {
        guard CommandLine.arguments.count == 3 else {
            FileHandle.standardError.write(Data("Verwendung: object-capture-worker <Bildordner> <Ausgabe.usdz>\n".utf8))
            exit(2)
        }
        do {
            let input = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
            let output = URL(fileURLWithPath: CommandLine.arguments[2])
            guard PhotogrammetrySession.isSupported else {
                throw NSError(domain: "AIPrintStudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Object Capture wird auf diesem Mac nicht unterstützt."])
            }
            let session = try PhotogrammetrySession(input: input)
            try session.process(requests: [.modelFile(url: output, detail: .medium)])
            for try await event in session.outputs {
                switch event {
                case .requestError(_, let error):
                    throw error
                case .processingComplete:
                    print(output.path)
                    return
                default:
                    continue
                }
            }
        } catch {
            FileHandle.standardError.write(Data("ObjectCaptureWorker: \(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
}
