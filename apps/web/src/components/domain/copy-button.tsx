import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/toast';

/** Icon button that copies `value` to the clipboard and confirms with a tick. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      notify.success('Copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error('Your browser blocked copying. Select the text and copy it instead.');
    }
  }
  return (
    <Button
      size="sm"
      iconOnly
      aria-label={label}
      onClick={() => void copy()}
      icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    />
  );
}
