// 사용: MANDONG_PW=... node build.js <원본 html> <출력 html>
// 원본의 스크립트 전체(패턴 데이터 포함)를 암호화하고 잠금 화면을 붙인다.
const fs = require("fs"), { webcrypto: wc } = require("crypto");
const [src, out] = process.argv.slice(2);
const pw = (process.env.MANDONG_PW || "").trim().toLowerCase();
if (!pw) throw new Error("no password");
const IT = 600000;
let html = fs.readFileSync(src, "utf8");
const a = html.indexOf("<script>"), b = html.lastIndexOf("</script>");
const code = html.slice(a + 8, b);
const b64 = u => Buffer.from(u).toString("base64");
(async () => {
  // 이전 빌드의 salt 를 재사용해야 이미 연 기기에서 다시 묻지 않는다.
  let salt = wc.getRandomValues(new Uint8Array(16));
  if (fs.existsSync(out)) { const m = fs.readFileSync(out, "utf8").match(/salt:"([^"]+)"/); if (m) salt = Buffer.from(m[1], "base64"); }
  const iv = wc.getRandomValues(new Uint8Array(12));
  const mat = await wc.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const raw = await wc.subtle.deriveBits({ name: "PBKDF2", salt, iterations: IT, hash: "SHA-256" }, mat, 256);
  const key = await wc.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  const ct = await wc.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(code));
  const back = new TextDecoder().decode(await wc.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
  if (back !== code) throw new Error("roundtrip failed");

  const loader = `
(function(){
const P = {salt:"${b64(salt)}", iv:"${b64(iv)}", it:${IT}, ct:"${b64(ct)}"};
const el = id => document.getElementById(id);
const dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const enc = u => btoa(String.fromCharCode.apply(null, u));
const KEY = "mandong-key";
async function derive(pw){
  const m = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2", salt:dec(P.salt), iterations:P.it, hash:"SHA-256"}, m, 256));
}
async function unlock(raw){
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:dec(P.iv)}, k, dec(P.ct)));
}
function run(code){
  el("lock").hidden = true; el("app").hidden = false;
  const s = document.createElement("script"); s.textContent = code; document.body.appendChild(s);
}
function ask(msg){ el("lock").hidden = false; el("lockMsg").textContent = msg || ""; el("pw").focus(); }
el("lockForm").addEventListener("submit", async e => {
  e.preventDefault();
  const pw = el("pw").value.trim().toLowerCase(); if(!pw) return;
  el("lockMsg").textContent = "확인 중…";
  try{
    const raw = await derive(pw); const code = await unlock(raw);
    try{ localStorage.setItem(KEY, enc(raw)); }catch(e){}
    run(code);
  }catch(err){ el("pw").value = ""; ask("비밀번호가 맞지 않습니다."); }
});
(async () => {
  if(!(window.crypto && crypto.subtle)){ ask("이 브라우저에서는 열 수 없습니다. Chrome이나 Safari에서 https 주소로 열어 주세요."); return; }
  let saved = null; try{ saved = localStorage.getItem(KEY); }catch(e){}
  if(saved){ try{ run(await unlock(dec(saved))); return; }catch(e){ try{ localStorage.removeItem(KEY); }catch(e2){} } }
  ask("");
})();
if("serviceWorker" in navigator && location.protocol === "https:"){ navigator.serviceWorker.register("sw.js").catch(() => {}); }
})();
`;
  const lock = `<div class="wrap" id="lock" hidden>
  <header><h1>만동이 패턴 연습</h1></header>
  <form class="input" id="lockForm">
    <input id="pw" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="비밀번호" aria-label="비밀번호">
    <button class="btn primary" type="submit">열기</button>
  </form>
  <p class="hint" id="lockMsg" role="status"></p>
</div>
<noscript><p class="hint" style="padding:16px">이 뷰어에서는 내용이 표시되지 않습니다. Chrome이나 Safari 같은 브라우저로 열어 주세요.</p></noscript>
`;
  if (!html.includes('<body>\n<div class="wrap">') && !html.includes('<body>\r\n<div class="wrap">')) throw new Error("wrap not found");
  html = html.slice(0, a) + "<script>" + loader + html.slice(b);
  html = html.replace(/<body>(\r?\n)<div class="wrap">/, (m, nl) => "<body>" + nl + lock + '<div class="wrap" id="app" hidden>');
  fs.writeFileSync(out, html);
  // 평문이 남지 않았는지 확인
  for (const w of ["const DATA", "const LEADS", pw === "" ? "\0" : `"${pw}"`]) if (html.includes(w)) throw new Error("plaintext leak: " + w);
  new Function(loader); // 문법 확인
  console.log("built", html.length, "bytes; salt", b64(salt));
})();
