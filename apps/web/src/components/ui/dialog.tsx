import { Dialog as Primitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;

// Follow the visible viewport when a mobile keyboard or browser toolbar opens.
// The callback ref also attaches correctly when a closed Portal first mounts.
function trackViewport(node: HTMLDivElement | null) {
  if (!node) return;
  const viewport = window.visualViewport;
  const update = () => {
    node.style.height = `${viewport?.height ?? window.innerHeight}px`;
    node.style.top = `${viewport?.offsetTop ?? 0}px`;
  };
  update();
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  };
}

export function DialogContent({
  className,
  children,
  variant = "dialog",
  ...props
}: React.ComponentProps<typeof Primitive.Content> & {
  variant?: "dialog" | "sheet";
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="luvo-dialog-overlay" />
      <div
        ref={trackViewport}
        className="luvo-dialog-viewport"
        data-variant={variant}
      >
        <Primitive.Content
          className={cn("dialog-content", className)}
          data-variant={variant}
          {...props}
        >
          <div className="dialog-scroll">
            {variant === "sheet" && (
              <div className="dialog-sheet-grip" aria-hidden="true" />
            )}
            {children}
          </div>
          <Primitive.Close className="dialog-close" aria-label="닫기">
            <X size={18} />
          </Primitive.Close>
        </Primitive.Content>
      </div>
    </Primitive.Portal>
  );
}
