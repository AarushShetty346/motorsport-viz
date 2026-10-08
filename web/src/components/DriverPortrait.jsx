// The driver's photo, or a portrait card with their initials in team colour until one is added.
export default function DriverPortrait({ driver, photo, small = false }) {
  return (
    <figure className={`portrait ${small ? 'portrait-small' : ''}`}>
      <div className="portrait-layer portrait-face">
        {photo?.file ? <img src={`/img/drivers/${photo.file}`} alt={driver.name} /> : <Initials driver={driver} />}
      </div>
      {!small && photo?.author && (
        <figcaption className="portrait-hint">
          <span className="portrait-credit">Photo: {photo.author}{photo.license ? `, ${photo.license}` : ''}</span>
        </figcaption>
      )}
    </figure>
  );
}

function Initials({ driver }) {
  const initials = `${driver.firstName?.[0] || ''}${driver.lastName?.[0] || ''}`;
  return (
    <div className="portrait-initials" style={{ '--team': driver.teamColor || '#888888' }} role="img" aria-label={driver.name}>
      <span className="portrait-number mono">{driver.number}</span>
      <span className="portrait-letters">{initials}</span>
    </div>
  );
}
