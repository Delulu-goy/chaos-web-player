// Chaos Radio — Logo SVG riusato in Header e altri punti

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export default function LogoMark({ size = 36, className = "" }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <path
          key={i}
          d="M24 24 C24 14 30 8 24 2 C30 10 38 12 42 20 C34 18 28 20 24 24Z"
          fill="#FF5A1F"
          transform={`rotate(${i * 60} 24 24)`}
        />
      ))}
    </svg>
  );
}