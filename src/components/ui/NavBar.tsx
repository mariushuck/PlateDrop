import ThemeToggle from "./ThemeToggle";

/** Translucent, sticky iOS navigation bar. Children are laid out left to right, spaced apart; the theme switch sits last. */
export default function NavBar({
  children,
  width = "max-w-xl",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <header className="bar sticky top-0 z-40 border-b-[0.5px] border-separator pt-[env(safe-area-inset-top)] print:hidden">
      <div className={`mx-auto flex min-h-11 items-center gap-3 px-4 ${width}`}>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{children}</div>
        <ThemeToggle />
      </div>
    </header>
  );
}
