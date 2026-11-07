import { Switch as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root className={cn("luvo-switch", className)} {...props}>
      <Primitive.Thumb className="luvo-switch-thumb" />
    </Primitive.Root>
  );
}
