// Chaos Radio — EmptyState per liste vuote

interface EmptyStateProps {
  title?: string;
  message?: string;
}

export default function EmptyState({
  title = "Niente qui",
  message = "Non c'è ancora nulla da mostrare.",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-lg font-bold text-white/60">{title}</p>
      <p className="mt-2 text-sm text-white/40">{message}</p>
    </div>
  );
}