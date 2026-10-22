import Foundation

protocol XPrinterPrinter {
    var isConnected: Bool { get }
    func connect(completion: @escaping (Result<Void, Error>) -> Void)
    func disconnect()
    func printRaw(_ data: Data, completion: @escaping (Result<Void, Error>) -> Void)
}

enum PrinterError: Error {
    case sdkNotIntegrated
    case notConnected
}

final class XPrinterSDKAdapter: XPrinterPrinter {
    private(set) var isConnected = false

    func connect(completion: @escaping (Result<Void, Error>) -> Void) {
        // TODO: Replace with Xprinter iOS SDK calls.
        // Keep all vendor-specific code inside this adapter.
        completion(.failure(PrinterError.sdkNotIntegrated))
    }

    func disconnect() {
        isConnected = false
        // TODO: vendorSDK.disconnect()
    }

    func printRaw(_ data: Data, completion: @escaping (Result<Void, Error>) -> Void) {
        guard isConnected else {
            completion(.failure(PrinterError.notConnected))
            return
        }
        // TODO: vendorSDK.write(data)
        completion(.failure(PrinterError.sdkNotIntegrated))
    }
}
