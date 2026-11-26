export const LOGIN_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>黛玛诗办公楼 · 试用入口</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3efe6; color: #1c1a16; font: 16px/1.5 "PingFang SC", "Microsoft YaHei", sans-serif; }
      main { width: min(420px, calc(100% - 32px)); background: #fffdf8; border: 1px solid #d9d1c3; border-radius: 16px; padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 1.4rem; }
      p { margin: 0 0 16px; color: #5c564c; }
      label { display: grid; gap: 6px; font-weight: 600; }
      input { min-height: 44px; border: 1px solid #d9d1c3; border-radius: 10px; padding: 8px 10px; font: inherit; }
      button { margin-top: 16px; min-height: 44px; width: 100%; border: 0; border-radius: 12px; background: #1f3a34; color: #fff; font: inherit; }
      .error { min-height: 1.5em; color: #8a2f24; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>黛玛诗办公楼</h1>
      <p>试用入口。请输入共用密码。合同和金额只在进入后显示。</p>
      <form id="login">
        <label>试用密码
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit">进入</button>
        <p class="error" id="error"></p>
      </form>
    </main>
    <script>
      const form = document.getElementById("login")
      const error = document.getElementById("error")
      form.addEventListener("submit", async (event) => {
        event.preventDefault()
        error.textContent = "正在核对…"
        const password = new FormData(form).get("password")
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        })
        if (response.ok) {
          location.href = "/"
          return
        }
        error.textContent = response.status === 503 ? "试用密码还没配置好。" : "密码不对。"
      })
    </script>
  </body>
</html>
`
