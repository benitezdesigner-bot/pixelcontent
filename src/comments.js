// PixelContent — cuentas de lectores y comentarios (Supabase).
// Se carga solo en las páginas de noticia que tienen <section data-comments>.
(function () {
  var box = document.querySelector("[data-comments]");
  if (!box || !window.supabase) return;
  var cfg = { url: box.dataset.url, key: box.dataset.key, page: box.dataset.page };
  var es = (document.body.dataset.lang || "en") === "es";
  var T = es
    ? {
        signin: "Iniciar sesión", signup: "Crear cuenta", signout: "Cerrar sesión", as: "Conectado como",
        email: "Correo", password: "Contraseña (mínimo 6 caracteres)", name: "Tu nombre (como aparecerá)",
        haveAcc: "¿Ya tienes cuenta? Inicia sesión", noAcc: "¿No tienes cuenta? Créala gratis",
        write: "Escribe tu comentario…", post: "Publicar", empty: "Sé el primero en comentar.",
        loginToComment: "Crea tu cuenta gratis de PixelContent o inicia sesión para comentar.",
        checkEmail: "¡Listo! Revisa tu correo para confirmar tu cuenta y luego inicia sesión.",
        del: "Borrar", confirmDel: "¿Borrar tu comentario?", bad: "Tu comentario tiene palabras no permitidas. Por favor, con respeto.",
        tooShort: "Escribe al menos 2 caracteres.", error: "Algo salió mal. Inténtalo de nuevo.",
        wrongLogin: "Correo o contraseña incorrectos.", exists: "Ese correo ya tiene cuenta. Inicia sesión.",
        needName: "Escribe tu nombre (2 a 30 caracteres).", forgot: "¿Olvidaste tu contraseña?", resetSent: "Te enviamos un correo para cambiar tu contraseña.",
        n: function (k) { return k === 1 ? "1 comentario" : k + " comentarios"; },
      }
    : {
        signin: "Sign in", signup: "Create account", signout: "Sign out", as: "Signed in as",
        email: "Email", password: "Password (at least 6 characters)", name: "Your name (as it will appear)",
        haveAcc: "Already have an account? Sign in", noAcc: "No account? Create one for free",
        write: "Write your comment…", post: "Post", empty: "Be the first to comment.",
        loginToComment: "Create your free PixelContent account or sign in to comment.",
        checkEmail: "Done! Check your email to confirm your account, then sign in.",
        del: "Delete", confirmDel: "Delete your comment?", bad: "Your comment has words that aren't allowed. Please keep it civil.",
        tooShort: "Write at least 2 characters.", error: "Something went wrong. Please try again.",
        wrongLogin: "Wrong email or password.", exists: "That email already has an account. Sign in instead.",
        needName: "Enter your name (2 to 30 characters).", forgot: "Forgot your password?", resetSent: "We sent you an email to reset your password.",
        n: function (k) { return k === 1 ? "1 comment" : k + " comments"; },
      };
  // palabras que no se publican (insultos comunes en inglés y español)
  var BAD = /\b(fuck|shit|bitch|cunt|nigg|fag|retard|whore|puta|puto|pendej|mierda|cabr[oó]n|marica|maric[oó]n|verga|chinga|coñ|zorra|idiota de mierda)\w*/i;
  var sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
  var user = null, profileName = "", mode = "signin";

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function when(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(es ? "es" : "en", { numeric: "auto", style: "short" }) : null;
    if (!rtf) return new Date(iso).toLocaleDateString();
    if (s < 60) return es ? "ahora" : "just now";
    if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
    if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
    return rtf.format(-Math.round(s / 86400), "day");
  }
  var listEl = box.querySelector("[data-c-list]"), formEl = box.querySelector("[data-c-form]"), countEl = box.querySelector("[data-c-count]");

  function msg(target, text, ok) {
    var m = target.querySelector(".c-msg") || target.appendChild(el("p", "c-msg"));
    m.textContent = text || ""; m.classList.toggle("ok", !!ok);
  }

  async function load() {
    var r = await sb.from("comments").select("id,author_name,body,created_at,user_id").eq("page", cfg.page).order("created_at", { ascending: true }).limit(300);
    listEl.innerHTML = "";
    var rows = r.data || [];
    countEl.textContent = T.n(rows.length);
    if (!rows.length) { listEl.appendChild(el("p", "c-empty", T.empty)); return; }
    rows.forEach(function (c) {
      var item = el("article", "c-item");
      var head = el("div", "c-head");
      var av = el("span", "c-av", (c.author_name || "?").trim().charAt(0).toUpperCase());
      head.appendChild(av);
      head.appendChild(el("b", "c-name", c.author_name || "Reader"));
      head.appendChild(el("time", "c-time", when(c.created_at)));
      if (user && c.user_id === user.id) {
        var d = el("button", "c-del", T.del);
        d.addEventListener("click", async function () {
          if (!confirm(T.confirmDel)) return;
          await sb.from("comments").delete().eq("id", c.id);
          load();
        });
        head.appendChild(d);
      }
      item.appendChild(head);
      item.appendChild(el("p", "c-body", c.body));
      listEl.appendChild(item);
    });
  }

  function renderForm() {
    formEl.innerHTML = "";
    if (user) {
      var who = el("div", "c-who");
      who.appendChild(el("span", null, T.as + " "));
      who.appendChild(el("b", null, profileName || user.email));
      var out = el("button", "c-link", T.signout);
      out.addEventListener("click", async function () { await sb.auth.signOut(); });
      who.appendChild(out);
      var ta = el("textarea", "c-ta"); ta.placeholder = T.write; ta.maxLength = 1500; ta.rows = 3;
      var row = el("div", "c-row");
      var cnt = el("span", "c-cnt", "0/1500");
      ta.addEventListener("input", function () { cnt.textContent = ta.value.length + "/1500"; });
      var btn = el("button", "c-btn", T.post);
      btn.addEventListener("click", async function () {
        var body = ta.value.trim();
        if (body.length < 2) return msg(formEl, T.tooShort);
        if (BAD.test(body)) return msg(formEl, T.bad);
        btn.disabled = true;
        var r = await sb.from("comments").insert({ page: cfg.page, body: body });
        btn.disabled = false;
        if (r.error) return msg(formEl, r.error.message || T.error);
        ta.value = ""; cnt.textContent = "0/1500"; msg(formEl, "");
        load();
      });
      row.appendChild(cnt); row.appendChild(btn);
      formEl.appendChild(who); formEl.appendChild(ta); formEl.appendChild(row);
      return;
    }
    formEl.appendChild(el("p", "c-cta", T.loginToComment));
    var f = el("form", "c-auth");
    var name = el("input"); name.type = "text"; name.placeholder = T.name; name.maxLength = 30; name.autocomplete = "nickname";
    var email = el("input"); email.type = "email"; email.placeholder = T.email; email.required = true; email.autocomplete = "email";
    var pass = el("input"); pass.type = "password"; pass.placeholder = T.password; pass.required = true; pass.minLength = 6;
    pass.autocomplete = mode === "signup" ? "new-password" : "current-password";
    if (mode === "signup") f.appendChild(name);
    f.appendChild(email); f.appendChild(pass);
    var go = el("button", "c-btn", mode === "signup" ? T.signup : T.signin); go.type = "submit";
    f.appendChild(go);
    var sw = el("button", "c-link", mode === "signup" ? T.haveAcc : T.noAcc); sw.type = "button";
    sw.addEventListener("click", function () { mode = mode === "signup" ? "signin" : "signup"; renderForm(); });
    f.appendChild(sw);
    if (mode === "signin") {
      var fg = el("button", "c-link", T.forgot); fg.type = "button";
      fg.addEventListener("click", async function () {
        if (!email.value) return email.focus();
        await sb.auth.resetPasswordForEmail(email.value, { redirectTo: location.href.split("#")[0] });
        msg(f, T.resetSent, true);
      });
      f.appendChild(fg);
    }
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      go.disabled = true;
      var r;
      if (mode === "signup") {
        var nm = name.value.trim();
        if (nm.length < 2 || nm.length > 30) { go.disabled = false; return msg(f, T.needName); }
        r = await sb.auth.signUp({ email: email.value.trim(), password: pass.value, options: { data: { display_name: nm, lang: es ? "es" : "en" }, emailRedirectTo: location.href.split("#")[0] } });
        go.disabled = false;
        if (r.error) return msg(f, /registered|exists/i.test(r.error.message) ? T.exists : r.error.message);
        if (!r.data.session) { mode = "signin"; renderForm(); return msg(formEl, T.checkEmail, true); }
      } else {
        r = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        go.disabled = false;
        if (r.error) return msg(f, /invalid/i.test(r.error.message) ? T.wrongLogin : r.error.message);
      }
    });
    formEl.appendChild(f);
  }

  async function setUser(u) {
    user = u || null; profileName = "";
    if (user) {
      var p = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      profileName = (p.data && p.data.display_name) || "";
    }
    renderForm(); load();
  }
  sb.auth.getSession().then(function (r) { setUser(r.data.session && r.data.session.user); });
  sb.auth.onAuthStateChange(function (_e, session) { setUser(session && session.user); });
})();
