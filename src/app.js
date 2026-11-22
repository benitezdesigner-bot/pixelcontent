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

  // 3. Menú en celular: desplaza la barra de categorías a la vista
  var menu = document.querySelector("[data-menu]");
  if (menu) menu.addEventListener("click", function () {
    var nav = document.querySelector("[data-nav]");
    nav.scrollIntoView({ behavior: "smooth" });
    nav.querySelector("a.on, a").focus();
  });

  // 4. Compartir
  var toast = document.querySelector("[data-toast]");
  function showToast() {
    if (!toast) return;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }
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
    };
    if (navigator.share) box.classList.add("can-share");
    box.querySelectorAll("[data-net]").forEach(function (el) {
      var net = el.dataset.net;
      if (links[net]) { el.href = links[net]; el.target = "_blank"; el.rel = "noopener"; }
      if (net === "native") el.addEventListener("click", function () { navigator.share({ title: title, url: url }).catch(function () {}); });
      if (net === "copy") el.addEventListener("click", function () {
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(showToast, function () { prompt("", url); });
      });
    });
  });
})();
