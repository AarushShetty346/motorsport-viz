// The yellow header block every page opens with, so the whole site carries the home page's look.
export default function Band({ className = '', style, children }) {
  return (
    <header className={`band tone-light ${className}`} style={style}>
      <div className="container band-inner">{children}</div>
    </header>
  );
}
