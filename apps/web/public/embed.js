(function () {
  "use strict";
  var doc = document;
  var created = [];

  function findEmbeds() {
    var scripts = doc.getElementsByTagName("script");
    var list = [];
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      if (!s.src) continue;
      var cleaned = s.src.replace(/[?#].*$/, "");
      if (!/\/(embed\.js)$/.test(cleaned)) continue;
      if (!s.getAttribute("data-form")) continue;
      list.push(s);
    }
    return list;
  }

  function rewrite(script) {
    var parts = script.src.split("/");
    var host = parts[0] + "//" + parts[2];
    var slug = script.getAttribute("data-form");
    var iframe = doc.createElement("iframe");
    iframe.setAttribute("src", host + "/form/" + encodeURIComponent(slug) + "?embed=1");
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("loading", "eager");
    iframe.style.width = "100%";
    iframe.style.minHeight = "480px";
    iframe.style.border = "none";
    iframe.style.display = "block";
    script.parentNode.insertBefore(iframe, script);
    script.parentNode.removeChild(script);
    created.push(iframe);
  }

  function handleMessage(event) {
    var height = event.data && event.data.__formlyHeight;
    if (typeof height !== "number") return;
    for (var j = 0; j < created.length; j++) {
      if (created[j].contentWindow === event.source) {
        created[j].style.height = Math.max(480, height) + "px";
        break;
      }
    }
  }

  var embeds = findEmbeds();
  for (var k = 0; k < embeds.length; k++) rewrite(embeds[k]);

  if (doc.readyState === "loading") {
    var onChange = function () {
      var late = findEmbeds();
      for (var m = 0; m < late.length; m++) rewrite(late[m]);
    };
    doc.addEventListener("DOMContentLoaded", function once() {
      onChange();
      doc.removeEventListener("DOMContentLoaded", once);
    });
  }

  window.addEventListener("message", handleMessage);
})();