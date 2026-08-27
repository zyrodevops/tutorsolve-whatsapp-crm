export default function Loading() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <div className="w-12 h-12 border-4 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin shadow-sm"></div>
        <p className="text-[var(--color-brand-primary)] font-semibold tracking-wide">Loading...</p>
      </div>
    </div>
  );
}
