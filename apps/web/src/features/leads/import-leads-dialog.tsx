import { useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, Download, FileText, Upload } from 'lucide-react';
import type { ImportResult } from '@leados/shared';
import { useImportLeads } from '@/api/leads';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatNumber, pluralize } from '@/lib/format';
import { notify } from '@/lib/toast';

const MAX_BYTES = 2 * 1024 * 1024;
const TEMPLATE =
  'First name,Last name,Email,Phone,Company,Source,Status,Tags\n' +
  'Asha,Rao,asha@example.com,+91 98765 43210,Acme Pvt Ltd,Website,New,vip;follow-up\n';

export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leads-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Returns a friendly problem with the file, or null if it can be uploaded. */
export function validateCsv(file: File): string | null {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  if (!isCsv) return 'Choose a CSV file (it should end in .csv).';
  if (file.size > MAX_BYTES)
    return 'That file is larger than 2 MB. Split it into smaller files and import them one at a time.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

function ResultSummary({ result }: { result: ImportResult }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-success-fg">
        <CheckCircle2 aria-hidden className="size-5" />
        <p className="type-body font-medium">Import finished</p>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {[
          ['Created', result.created],
          ['Skipped duplicates', result.skipped],
          ['Errors', result.errors.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-muted/40 p-3">
            <dt className="type-caption text-fg-muted">{label}</dt>
            <dd className="type-section text-fg tabular-nums">{formatNumber(Number(value))}</dd>
          </div>
        ))}
      </dl>
      {result.errors.length > 0 && (
        <div>
          <h3 className="mb-2 type-small font-medium text-fg">Rows we couldn't import</h3>
          <ul
            className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface type-small"
            aria-label="Import errors"
          >
            {result.errors.map((e) => (
              <li
                key={`${e.row}-${e.message}`}
                className="border-b border-border px-3 py-1.5 last:border-b-0"
              >
                <span className="font-medium text-fg">Row {e.row}:</span>{' '}
                <span className="text-fg-muted">{e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ImportLeadsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importLeads = useImportLeads();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setFile(null);
    setProblem(null);
    setResult(null);
    importLeads.reset();
  }

  function pick(f: File | undefined) {
    if (!f) return;
    const issue = validateCsv(f);
    setProblem(issue);
    setFile(issue ? null : f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  async function upload() {
    if (!file) return;
    try {
      const r = await importLeads.mutateAsync(file);
      setResult(r);
      notify.success(`Imported ${pluralize(r.created, 'lead')}`);
    } catch (err) {
      setProblem(errorMessage(err, "We couldn't import that file."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (importLeads.isPending) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent
        title="Import leads"
        description="Upload a CSV with a header row. Duplicate emails are skipped."
        footer={
          result ? (
            <>
              <Button onClick={reset}>Import another file</Button>
              <Button
                variant="primary"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={importLeads.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void upload()}
                disabled={!file}
                loading={importLeads.isPending}
              >
                {importLeads.isPending ? 'Importing…' : 'Import leads'}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <ResultSummary result={result} />
        ) : (
          <div className="flex flex-col gap-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
                dragging
                  ? 'border-primary bg-primary-subtle/40'
                  : 'border-border-strong bg-muted/30',
              )}
            >
              {file ? (
                <FileText aria-hidden className="size-6 text-primary-text" />
              ) : (
                <Upload aria-hidden className="size-6 text-fg-subtle" />
              )}
              <p className="type-body text-fg">{file ? file.name : 'Drag a CSV file here'}</p>
              <p className="type-caption text-fg-muted">Up to 2 MB and 5,000 rows</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Button size="sm" onClick={() => inputRef.current?.click()}>
                {file ? 'Choose a different file' : 'Choose a file'}
              </Button>
            </div>
            {problem && (
              <p role="alert" className="type-small font-medium text-danger-fg">
                {problem}
              </p>
            )}
            <p className="type-small text-fg-muted">
              Columns we recognise: first name, last name, email, phone, company, source, status and
              tags (separate tags with “;”).{' '}
              <Button
                variant="link"
                size="sm"
                icon={<Download aria-hidden />}
                onClick={downloadTemplate}
              >
                Download template
              </Button>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
