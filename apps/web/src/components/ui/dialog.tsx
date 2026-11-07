import { Dialog as Primitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Primitive.Content
        className={cn(
          "dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-32px)] max-w-[600px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-[28px] border border-white/50 bg-white p-7 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          className="absolute right-5 top-5 flex size-9 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
          aria-label="닫기"
        >
          <X className="size-[18px]" />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
