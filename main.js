function toggle_light_mode() {
  const isLight = document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

(function () {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }
})();
