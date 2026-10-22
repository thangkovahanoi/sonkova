import SwiftUI

struct ContentView: View {
    @State private var status = "Chưa kết nối"

    private let printer = XPrinterSDKAdapter()

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Image(systemName: "printer")
                    .font(.system(size: 54))
                Text("Xprinter N160I")
                    .font(.title2.bold())
                Text(status)
                    .foregroundStyle(.secondary)

                Button("Kết nối Bluetooth") {
                    printer.connect { result in
                        DispatchQueue.main.async {
                            switch result {
                            case .success: status = "Đã kết nối"
                            case .failure(let error): status = "Chưa tích hợp SDK: \(error)"
                            }
                        }
                    }
                }
                .buttonStyle(.borderedProminent)

                Button("In test") {
                    let data = Data([0x1B,0x40,0x1B,0x61,0x01])
                    printer.printRaw(data) { _ in }
                }
                .buttonStyle(.bordered)
            }
            .padding()
            .navigationTitle("Kho Xprinter")
        }
    }
}
