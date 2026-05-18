export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh w-screen overflow-hidden bg-[#0d0d0d] flex flex-col">
      {children}
    </div>
  );
}
