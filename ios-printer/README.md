# iOS Bluetooth companion

Mục tiêu: iPhone -> Bluetooth -> Xprinter N160I.

## Quan trọng

Không nên giả định Safari trên iPhone có thể mở Bluetooth Classic printer trực tiếp. Xprinter công bố iOS SDK chính thức, vì vậy project này đặt một adapter riêng để tích hợp SDK.

Tải iOS SDK từ trang SDK chính thức của Xprinter, sau đó thêm framework/package vào Xcode.

Sau khi tích hợp SDK, implement:

- connect()
- disconnect()
- isConnected()
- printRaw()
- printTest()

Web app có thể giao tiếp với companion app qua một cơ chế deep-link/local bridge tùy kiến trúc triển khai.

V1 của source này cung cấp protocol và adapter interface; không đóng gói SDK độc quyền.
