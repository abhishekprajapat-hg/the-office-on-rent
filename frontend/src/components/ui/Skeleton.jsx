import { cn } from "./utils";

// Themed shimmer (see .gl-skeleton in styles/glass.css) - follows the colour
// theme and light/dark mode.
const Skeleton = ({ className, ...props }) => (
  <div
    aria-hidden="true"
    className={cn("gl-skeleton rounded-lg", className)}
    {...props}
  />
);

export default Skeleton;
