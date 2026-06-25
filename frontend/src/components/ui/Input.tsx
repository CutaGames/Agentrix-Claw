import * as React from "react"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = "", type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={`
        flex h-10 w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2
        text-sm text-slate-100 placeholder:text-slate-400
        ring-offset-background
        file:border-0 file:bg-transparent file:text-sm file:font-medium
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${className}
      `}
      {...props}
    />
  );
}
