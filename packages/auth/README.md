# auth


### Example: 

```ts
import { AuthWebSocket } from "@paws/auth";
import { generate as genQR, QRErrorCorrectLevel } from "ts-qrcode-terminal";

const auth = new AuthWebSocket();

auth.on("qrCodeGenerated", ({ url }) => {
    genQR(url, {
        small: true,
        qrErrorCorrectLevel: QRErrorCorrectLevel.L,
    })

    console.log("Scan the QR code with the dihcord mobile app")
})

auth.on("codeScanned", ({ user }) => {
    console.log("Code scanned by", JSON.stringify(user, null, 2))
    console.log("Waiting for authorize btton click")
})

auth.on("success", ({ token }) => {
    console.log("Login success - Trimmed token:", token.slice(0, 32))
})
```