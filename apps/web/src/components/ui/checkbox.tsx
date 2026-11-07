import { Checkbox as Primitive } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "peer flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] border-slate-300 bg-white text-white transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <Primitive.Indicator>
        <Check className="size-[18px]" strokeWidth={3} />
      </Primitive.Indicator>
    </Primitive.Root>
  );
}
