import { useEffect, useState } from 'react';

// Real car photos and 3D models are optional files in web/public/img/cars/, listed in
// credits.json by team key (written by scripts/fetch-car-photos.mjs, or by hand):
//   "mclaren": { "photo": "mclaren.jpg", "author": "…", "license": "CC BY-SA 4.0", "sourceUrl": "…",
//                "model": "mclaren.glb", "modelRotate": 0, "modelAuthor": "…", "modelLicense": "…", "modelSourceUrl": "…" }
let cache = null;
function load() {
  if (!cache) {
    cache = fetch('/img/cars/credits.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return cache;
}

export function useCarMedia(key) {
  const [media, setMedia] = useState(null);
  useEffect(() => {
    let live = true;
    load().then((all) => live && setMedia(all?.[key] || {}));
    return () => { live = false; };
  }, [key]);
  return media;
}
