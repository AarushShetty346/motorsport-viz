// The driver's photo, or a stand-in silhouette until one is added.
export default function DriverPortrait({ driver, photo }) {
  return (
    <figure className="portrait">
      <div className="portrait-layer portrait-face">
        {photo?.file ? <img src={`/img/drivers/${photo.file}`} alt={driver.name} /> : <Silhouette />}
      </div>
      {photo?.author && (
        <figcaption className="portrait-hint">
          <span className="portrait-credit">Photo: {photo.author}{photo.license ? `, ${photo.license}` : ''}</span>
        </figcaption>
      )}
    </figure>
  );
}

function Silhouette() {
  return (
    <svg viewBox="0 0 400 500" className="portrait-silhouette" aria-hidden="true">
      <path d="M200 70 C258 70 296 116 296 186 C296 250 262 302 200 302 C138 302 104 250 104 186 C104 116 142 70 200 70 Z" />
      <path d="M160 290 H240 L246 340 C310 352 372 380 392 440 L400 500 H0 L8 440 C28 380 90 352 154 340 Z" />
    </svg>
  );
}
