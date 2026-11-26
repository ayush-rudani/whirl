import { cn } from "@/lib/utils";

/* The fallback when a diagram can't be drawn: why, then the source itself,
   with the offending line marked when the error knows where it is. */
export function DiagramSource({
  code,
  detail,
  line,
}: {
  code: string;
  detail: string;
  /** 1-based; 0 marks nothing. */
  line: number;
}) {
  const lines = code.split("\n");

  return (
    <>
      <p className="px-3 pt-2.5 text-xs text-muted-foreground">{detail}</p>
      <pre className="overflow-x-auto p-3 text-xs">
        <code className="block w-fit min-w-full">
          {lines.map((text, index) => (
            <span
              key={index}
              className={cn(
                "-mx-1.5 block rounded px-1.5",
                index + 1 === line && "bg-(--destructive-soft)",
              )}
            >
              {/* A blank line still needs a box to keep its height. */}
              {text || " "}
            </span>
          ))}
        </code>
      </pre>
    </>
  );
}
