import { useState } from 'react';
import { KanbanSquare, Plus } from 'lucide-react';
import type { Pipeline } from '@leados/shared';
import { usePipelines } from '@/api/pipelines';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { PipelineEditorDialog } from './pipelines/pipeline-editor-dialog';
import { PipelineListItem } from './pipelines/pipeline-list-item';

export default function PipelinesSettingsPage() {
  useDocumentTitle('Pipelines');
  const { data: pipelines, isLoading, error, refetch, isRefetching } = usePipelines();
  const [editor, setEditor] = useState<{ open: boolean; pipeline: Pipeline | null }>({
    open: false,
    pipeline: null,
  });

  const openNew = () => setEditor({ open: true, pipeline: null });
  const newButton = (
    <Button variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={openNew}>
      New pipeline
    </Button>
  );

  let body;
  if (isLoading)
    body = (
      <LoadingRegion label="Loading pipelines…" className="flex flex-col gap-4 py-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }, (_, j) => (
                <Skeleton key={j} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </LoadingRegion>
    );
  else if (error)
    body = (
      <ErrorState
        compact
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    );
  else if (!pipelines?.length)
    body = (
      <EmptyState
        compact
        icon={KanbanSquare}
        title="No pipelines yet"
        text="Create a pipeline with the stages your deals move through."
        action={newButton}
      />
    );
  else
    body = (
      <ul className="divide-y divide-border">
        {pipelines.map((p) => (
          <PipelineListItem
            key={p.id}
            pipeline={p}
            onEdit={() => setEditor({ open: true, pipeline: p })}
          />
        ))}
      </ul>
    );

  return (
    <Card>
      <CardHeader
        title="Pipelines"
        description="Set up the stages deals move through. Each pipeline has one Won and one Lost stage."
        actions={pipelines?.length ? newButton : undefined}
      />
      <CardBody>{body}</CardBody>
      <PipelineEditorDialog
        open={editor.open}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        pipeline={editor.pipeline}
      />
    </Card>
  );
}
