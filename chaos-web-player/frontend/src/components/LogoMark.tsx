// Chaos Radio — Logo riusato in Header e Login (immagine chaos-logo.png)
// Animazione di rotazione lenta continua per dare il senso "live radio".

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export default function LogoMark({ size = 36, className = "" }: LogoMarkProps) {
  return (
    <img
      src="/chaos-logo.png"
      alt="Chaos Radio"
      width={size}
      height={size}
      aria-hidden="true"
      className={`animate-spin-slow ${className}`}
    />
  );
}