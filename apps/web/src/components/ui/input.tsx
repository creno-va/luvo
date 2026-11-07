import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border border-border bg-white px-3.5 text-[15px] outline-none transition-shadow placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
