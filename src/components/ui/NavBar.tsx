/** Translucent, sticky iOS navigation bar. Children are laid out left to right, spaced apart. */
export default function NavBar({
  children,
  width = "max-w-xl",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <header className="bar sticky top-0 z-40 border-b-[0.5px] border-separator pt-[env(safe-area-inset-top)] print:hidden">
      <div className={`mx-auto flex min-h-11 items-center justify-between gap-3 px-4 ${width}`}>
        {children}
      </div>
    </header>
  );
}
