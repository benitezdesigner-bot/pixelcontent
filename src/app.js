// PixelContent — comportamiento en el navegador
(function () {
  var lang = document.body.dataset.lang || "en";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // 1. Primera visita: si el navegador está en español, llevar a la edición en español.
  var home = document.body.dataset.home;
  if (home === "en" && !store.get("lang") && /^es\b/i.test(navigator.language || "")) {
    location.replace("es/index.html");
    return;
  }
  document.querySelectorAll("[data-setlang]").forEach(function (a) {
    a.addEventListener("click", function () { store.set("lang", a.dataset.setlang); });
  });
  if (!store.get("lang")) store.set("lang", lang);

  // 2. Fechas: "hace 2 h" / "2 hours ago"
  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" }) : null;
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!rtf || isNaN(s)) return null;
    if (s < 60) return lang === "es" ? "ahora" : "just now";
    if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
    if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
    return rtf.format(-Math.round(s / 86400), "day");
  }
  function refreshTimes() {
    document.querySelectorAll(".meta time, .updated time").forEach(function (t) {
      var v = ago(t.getAttribute("datetime"));
      if (v) t.textContent = v;
    });
  }
  refreshTimes();
  setInterval(refreshTimes, 60000);
  var today = document.querySelector("[data-today]");
  if (today) today.textContent = new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // 3. Menú en celular: el botón de 3 rayas abre y cierra el panel con todas las secciones
  var menu = document.querySelector("[data-menu]");
  var nav = document.querySelector("[data-nav]");
  function setMenu(open) {
    if (!menu || !nav) return;
    nav.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
    menu.setAttribute("aria-expanded", open ? "true" : "false");
    menu.classList.toggle("is-open", open);
    if (open) window.scrollTo(0, 0); // arriba: se ve el logo con la X para cerrar y el panel debajo
  }
  if (menu && nav) {
    menu.setAttribute("aria-expanded", "false");
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
      setMenu(!nav.classList.contains("open"));
    });
    nav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("click", function (e) { if (nav.classList.contains("open") && !nav.contains(e.target)) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", function () { if (window.innerWidth > 600) setMenu(false); });
  }

  // 4. Suscripción a notificaciones por correo (n8n → GetWeb)
  document.querySelectorAll("[data-notify]").forEach(function (box) {
    var form = box.querySelector("form"), msg = box.querySelector(".nt-msg"), btn = form.querySelector("button");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = msg.dataset.bad; msg.className = "nt-msg err"; form.email.focus(); return; }
      btn.disabled = true;
      fetch(box.dataset.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, name: form.name.value.trim(), website: form.website.value, lang: box.dataset.lang, page: location.href.split("#")[0] }),
      })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function () {
          msg.textContent = msg.dataset.ok; msg.className = "nt-msg ok";
          form.style.display = "none";
          store.set("subscribed", "1");
        })
        .catch(function () { msg.textContent = msg.dataset.err; msg.className = "nt-msg err"; btn.disabled = false; });
    });
  });

  // 5. Compartir
  var toast = document.querySelector("[data-toast]");
  function showToast() {
    if (!toast) return;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }
  // botón de compartir en cada tarjeta de noticia (portada y secciones)
  document.querySelectorAll("[data-cardshare]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var url = location.origin + "/" + btn.dataset.path, title = btn.dataset.title || document.title;
      if (navigator.share) navigator.share({ title: title, url: url }).catch(function () {});
      else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(showToast, function () { prompt("", url); });
    });
  });
  document.querySelectorAll("[data-share]").forEach(function (box) {
    var url = location.href.split("#")[0];
    var title = box.dataset.title || document.title;
    var u = encodeURIComponent(url), t = encodeURIComponent(title);
    var links = {
      x: "https://twitter.com/intent/tweet?url=" + u + "&text=" + t,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + u,
      whatsapp: "https://wa.me/?text=" + encodeURIComponent(title + " " + url),
      telegram: "https://t.me/share/url?url=" + u + "&text=" + t,
      linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=" + u,
      reddit: "https://www.reddit.com/submit?url=" + u + "&title=" + t,
      email: "mailto:?subject=" + t + "&body=" + encodeURIComponent(title + "\n\n" + url),
    };
    if (navigator.share) box.classList.add("can-share");
    box.querySelectorAll("[data-net]").forEach(function (el) {
      var net = el.dataset.net;
      if (links[net]) { el.href = links[net]; if (net !== "email") { el.target = "_blank"; el.rel = "noopener"; } }
      if (net === "native") el.addEventListener("click", function () { navigator.share({ title: title, url: url }).catch(function () {}); });
      if (net === "copy") el.addEventListener("click", function () {
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(showToast, function () { prompt("", url); });
      });
    });
  });
})();
