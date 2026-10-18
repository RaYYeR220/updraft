import { AppBar } from "@/components/chrome/AppBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppBar />
      {children}
    </>
  );
}
