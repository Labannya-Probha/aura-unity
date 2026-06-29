import { cn } from '@/lib/utils'

const variants = {
  default: 'au-btn',
  ghost: 'au-btn au-btn--ghost',
}

export function Button({ className, type = 'button', variant = 'default', ...props }) {
  return <button type={type} className={cn(variants[variant] || variants.default, className)} {...props} />
}
