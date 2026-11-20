/**
 * Self-hosted, busuanzi-compatible view counter.
 * Platform: Cloudflare Workers + D1 (both free tier, no payment method required).
 *
 * Endpoints:
 *   GET /busuanzi.pure.mini.js          Busuanzi-compatible client script,
 *                                       with the API base rewritten to this Worker's origin.
 *   GET /busuanzi?jsonpCallback=<name>  JSONP response: { site_pv, page_pv, site_uv }.
 *                                       The page is identified by the Referer header,
 *                                       exactly like the original busuanzi service.
 *
 * Required binding: a D1 database bound to this Worker under the name "DB".
 * Optional secret : "SALT" (any random string, used to hash visitor IPs so raw
 *                    addresses are never stored).
 */

const CLIENT_JS = String.raw`var bszCaller,bszTag;!function(){var c,d,e,a=!1,b=[];ready=function(c){return a||"interactive"===document.readyState||"complete"===document.readyState?c.call(document):b.push(function(){return c.call(this)}),this},d=function(){for(var a=0,c=b.length;c>a;a++)b[a].apply(document);b=[]},e=function(){a||(a=!0,d.call(window),document.removeEventListener?document.removeEventListener("DOMContentLoaded",e,!1):document.attachEvent&&(document.detachEvent("onreadystatechange",e),window==window.top&&(clearInterval(c),c=null)))},document.addEventListener?document.addEventListener("DOMContentLoaded",e,!1):document.attachEvent&&(document.attachEvent("onreadystatechange",function(){/loaded|complete/.test(document.readyState)&&e()}),window==window.top&&(c=setInterval(function(){try{a||document.documentElement.doScroll("left")}catch(b){return}e()},5)))}(),bszCaller={fetch:function(a,b){var c="BusuanziCallback_"+Math.floor(1099511627776*Math.random());window[c]=this.evalCall(b),a=a.replace("=BusuanziCallback","="+c),scriptTag=document.createElement("SCRIPT"),scriptTag.type="text/javascript",scriptTag.defer=!0,scriptTag.src=a,scriptTag.referrerPolicy="no-referrer-when-downgrade",document.getElementsByTagName("HEAD")[0].appendChild(scriptTag)},evalCall:function(a){return function(b){ready(function(){try{a(b),scriptTag.parentElement.removeChild(scriptTag)}catch(c){bszTag.hides()}})}}},bszCaller.fetch("__API_BASE__/busuanzi?jsonpCallback=BusuanziCallback",function(a){bszTag.texts(a),bszTag.shows()}),bszTag={bszs:["site_pv","page_pv","site_uv"],texts:function(a){this.bszs.map(function(b){var c=document.getElementById("busuanzi_value_"+b);c&&(c.innerHTML=a[b])})},hides:function(){this.bszs.map(function(a){var b=document.getElementById("busuanzi_container_"+a);b&&(b.style.display="none")})},shows:function(){this.bszs.map(function(a){var b=document.getElementById("busuanzi_container_"+a);b&&(b.style.display="inline")})}};`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/busuanzi.pure.mini.js") {
      return new Response(CLIENT_JS.replaceAll("__API_BASE__", url.origin), {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "access-control-allow-origin": "*",
        },
      });
    }

    if (url.pathname === "/busuanzi") {
      return count(request, env, url);
    }

    return new Response("Not found\n", { status: 404 });
  },
};

async function count(request, env, url) {
  const cb = url.searchParams.get("jsonpCallback") || "BusuanziCallback";
  if (!/^[\w.]+$/.test(cb)) {
    return new Response(
      "/**/ typeof " + cb + ' === "function" && ' + cb + "({});",
      { status: 400, headers: { "content-type": "application/javascript; charset=utf-8" } }
    );
  }

  // The visited page arrives in the Referer header (set by the client script's
  // referrerPolicy). Only the path is kept, so counts survive protocol or
  // domain redirects (e.g. http -> https, github.io variants).
  let page = "unknown";
  try {
    page = new URL(request.headers.get("Referer") || "").pathname || "/";
  } catch {}

  const ip = await sha256(
    request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "unknown",
    env
  );

  // Increment page view, site total, and record the visitor (IP hash only).
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO pv (page, count) VALUES (?1, 1) ON CONFLICT(page) DO UPDATE SET count = count + 1"
    ).bind(page),
    env.DB.prepare(
      "INSERT INTO site (id, count) VALUES ('site_pv', 1) ON CONFLICT(id) DO UPDATE SET count = count + 1"
    ),
    env.DB.prepare("INSERT OR IGNORE INTO uv (ip) VALUES (?1)").bind(ip),
  ]);

  const row = await env.DB.prepare(
    "SELECT (SELECT count FROM pv WHERE page = ?1) AS page_pv, " +
      "(SELECT count FROM site WHERE id = 'site_pv') AS site_pv, " +
      "(SELECT COUNT(*) FROM uv) AS site_uv"
  )
    .bind(page)
    .first();

  const data = {
    site_pv: row?.site_pv ?? 0,
    page_pv: row?.page_pv ?? 0,
    site_uv: row?.site_uv ?? 0,
  };

  return new Response(cb + "(" + JSON.stringify(data) + ")", {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Hash the visitor IP with a salt; raw addresses are never persisted.
async function sha256(text, env) {
  const data = new TextEncoder().encode((env.SALT || "bsz-default-salt") + ":" + text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
