import { SiteHeader } from "@/components/chrome/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
