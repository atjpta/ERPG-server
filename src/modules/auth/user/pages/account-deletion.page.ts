/**
 * Trang web yêu cầu xoá tài khoản — URL này khai báo ở Play Console (App content → Data safety →
 * Delete account URL). Google yêu cầu trang nêu rõ tên game, cách xoá, dữ liệu bị xoá/giữ lại.
 */
export const GAME_NAME = "ERPG";

export const renderAccountDeletionPage = () => `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${GAME_NAME} — Xoá tài khoản</title>
<style>
  :root { color-scheme: light dark; --fg: #1b1b1f; --bg: #f7f7f9; --card: #fff; --muted: #5b5b66; --accent: #c0392b; --line: #dcdce3; }
  @media (prefers-color-scheme: dark) { :root { --fg: #ececf1; --bg: #121216; --card: #1c1c22; --muted: #a0a0ad; --accent: #ff6b5e; --line: #33333d; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.55 system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  main { max-width: 640px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  h2 { font-size: 1.1rem; margin: 28px 0 8px; }
  p, li { color: var(--muted); }
  form { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-top: 24px; }
  label { display: block; font-weight: 600; margin: 14px 0 6px; }
  input, textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
  button { margin-top: 18px; width: 100%; padding: 12px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  #result { margin-top: 14px; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Xoá tài khoản ${GAME_NAME}</h1>
  <p>Trang này dành cho người chơi muốn xoá tài khoản game <strong>${GAME_NAME}</strong> và dữ liệu liên quan.</p>

  <h2>Cách nhanh nhất: xoá ngay trong game</h2>
  <p>Mở game → <strong>Cài đặt</strong> → <strong>Tài khoản</strong> → <strong>Xoá tài khoản</strong>. Tài khoản bị xoá ngay lập tức.</p>

  <h2>Hoặc gửi yêu cầu tại đây</h2>
  <p>Nếu không vào được game, hãy điền email đăng nhập hoặc tên nhân vật. Chúng tôi sẽ xác minh và xử lý trong vòng 30 ngày.</p>

  <h2>Dữ liệu bị xoá</h2>
  <ul>
    <li>Nhân vật và toàn bộ tiến trình chơi (cấp độ, vị trí, vật phẩm...).</li>
    <li>Liên kết đăng nhập Google / Google Play Games, email và mật khẩu.</li>
    <li>Toàn bộ phiên đăng nhập trên mọi thiết bị.</li>
  </ul>
  <h2>Dữ liệu được giữ lại</h2>
  <ul>
    <li>Nhật ký yêu cầu xoá (thời điểm, trạng thái) — để chứng minh đã xử lý theo quy định.</li>
    <li>Hồ sơ giao dịch thanh toán (nếu có) — theo quy định pháp luật về kế toán, thuế.</li>
  </ul>

  <form id="form">
    <label for="contactEmail">Email đăng nhập</label>
    <input id="contactEmail" name="contactEmail" type="email" autocomplete="email">
    <label for="playerName">Tên nhân vật</label>
    <input id="playerName" name="playerName" maxlength="32">
    <label for="reason">Lý do (không bắt buộc)</label>
    <textarea id="reason" name="reason" rows="3" maxlength="500"></textarea>
    <button type="submit">Gửi yêu cầu xoá tài khoản</button>
    <div id="result" role="status"></div>
  </form>
</main>
<script>
  const form = document.getElementById("form");
  const result = document.getElementById("result");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {};
    for (const [key, value] of new FormData(form)) if (String(value).trim()) body[key] = String(value).trim();
    if (!body.contactEmail && !body.playerName) { result.textContent = "Vui lòng nhập email hoặc tên nhân vật."; return; }
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const res = await fetch("/auth/account-deletion-requests", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      result.textContent = res.ok
        ? "Đã nhận yêu cầu. Chúng tôi sẽ xử lý trong vòng 30 ngày."
        : res.status === 429 ? "Bạn gửi quá nhiều lần, vui lòng thử lại sau." : "Gửi thất bại, vui lòng thử lại.";
      if (res.ok) form.reset();
    } catch {
      result.textContent = "Không kết nối được máy chủ, vui lòng thử lại.";
    } finally {
      button.disabled = false;
    }
  });
</script>
</body>
</html>`;
