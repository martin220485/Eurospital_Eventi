import { cn } from "@/lib/utils";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li
            key={label}
            data-state={state}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1 text-sm",
              state === "active" && "bg-blue-600 text-white",
              state === "done" && "bg-blue-100 text-blue-700",
              state === "todo" && "bg-gray-100 text-gray-500",
            )}
          >
            <span className="font-medium">{i + 1}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
