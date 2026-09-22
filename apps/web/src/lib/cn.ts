import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about our custom type-scale utilities so they are
// treated as font-size classes and deduplicated correctly.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ type: ['title', 'section', 'body', 'small', 'caption', 'metric'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
