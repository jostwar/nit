import * as React from "react";
import { cn } from "@/lib/utils";

const variantClasses = {
  default: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
  outline: "border border-gray-200 bg-white text-slate-700 hover:bg-gray-50",
  ghost: "text-slate-600 hover:bg-gray-100",
};

const sizeClasses = {
  default: "px-4 py-2 text-sm",
  sm: "h-7 px-3 text-xs",
  lg: "px-6 py-3 text-base",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
