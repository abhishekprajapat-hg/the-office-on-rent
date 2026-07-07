import { cn } from "./utils";

const Skeleton = ({ className, ...props }) => (
  <div
    aria-hidden="true"
    className={cn("animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800", className)}
    {...props}
  />
);

export default Skeleton;
