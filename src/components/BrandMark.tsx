const logoSrc = new URL('../../branding/aegis-icon-transparent.png', import.meta.url).href;

export function BrandMark() {
  return (
    <img
      className="aegis-logo-mark"
      src={logoSrc}
      width={40}
      height={40}
      alt=""
      aria-hidden="true"
    />
  );
}
