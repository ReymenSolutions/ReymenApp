/* Se carga en <head> antes de pintar: aplica tema e idioma guardados para que no haya parpadeo. */
(function () {
  var d = document.documentElement, t = null, l = null;
  try { t = localStorage.getItem("tw-theme"); l = localStorage.getItem("tw-lang"); } catch (e) {}
  if (t !== "light" && t !== "dark") {
    t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  d.setAttribute("data-theme", t);
  d.classList.add("js");
  if (l === "en") {
    // Se oculta un instante mientras se cambian los textos a inglés (app.js lo quita).
    d.classList.add("lang-en", "i18n-pending");
    d.lang = "en";
    setTimeout(function () { d.classList.remove("i18n-pending"); }, 1500);
  }
})();
