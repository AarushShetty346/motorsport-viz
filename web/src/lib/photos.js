import { useEffect, useState } from 'react';

// Driver photos are optional files in web/public/img/drivers/, listed with their
// credits in credits.json (written by `npm run photos:fetch`, or by hand).
let cache = null;
function load() {
  if (!cache) {
    cache = fetch('/img/drivers/credits.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return cache;
}

export function useDriverPhotos() {
  const [photos, setPhotos] = useState({});
  useEffect(() => {
    let live = true;
    load().then((p) => live && setPhotos(p || {}));
    return () => { live = false; };
  }, []);
  return photos;
}
