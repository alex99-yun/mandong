const fs = require("fs"), { webcrypto: wc } = require("crypto");
const h = fs.readFileSync(process.argv[2], "utf8");
const g = k => Buffer.from(h.match(new RegExp(k + ':"([^"]+)"'))[1], "base64");
(async () => {
  for (const pw of [process.env.MANDONG_PW, "wrong"]) {
    try {
      const m = await wc.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
      const raw = await wc.subtle.deriveBits({ name: "PBKDF2", salt: g("salt"), iterations: 600000, hash: "SHA-256" }, m, 256);
      const k = await wc.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      const t = new TextDecoder().decode(await wc.subtle.decrypt({ name: "AES-GCM", iv: g("iv") }, k, g("ct")));
      console.log(pw === "wrong" ? "wrong pw" : "right pw", "-> opened, has data:", t.includes("const DATA") && t.includes("const LEADS"));
    } catch (e) { console.log(pw === "wrong" ? "wrong pw" : "right pw", "-> rejected"); }
  }
})();
