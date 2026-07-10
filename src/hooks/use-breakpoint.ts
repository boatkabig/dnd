import { useState, useEffect } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

/**
 * 3-tier breakpoint hook for responsive design.
 * - mobile: <768px
 * - tablet: 768px - 1023px
 * - desktop: >=1024px
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("mobile");

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      if (width < 768) setBreakpoint("mobile");
      else if (width < 1024) setBreakpoint("tablet");
      else setBreakpoint("desktop");
    };

    updateBreakpoint();
    window.addEventListener("resize", updateBreakpoint);
    return () => window.removeEventListener("resize", updateBreakpoint);
  }, []);

  return breakpoint;
}

export function useIsMobile(): boolean {
  const bp = useBreakpoint();
  return bp === "mobile";
}

export function useIsDesktop(): boolean {
  const bp = useBreakpoint();
  return bp === "desktop";
}
