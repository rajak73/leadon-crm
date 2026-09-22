import type { CSSProperties } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { ColourPicker } from './colour-picker';
import type { PipelineFormIn } from './editor-state';

interface StageRowProps {
  sortId: string;
  index: number;
  count: number;
  onRemove: () => void;
  onMove: (from: number, to: number) => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
}

const radioLabel =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 type-small text-fg-muted hover:bg-muted has-[:checked]:text-fg has-[:checked]:font-medium';

export function StageRow({
  sortId,
  index,
  count,
  onRemove,
  onMove,
  onMarkWon,
  onMarkLost,
}: StageRowProps) {
  const { register, control, watch, formState } = useFormContext<PipelineFormIn>();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortId,
  });
  const stage = watch(`stages.${index}`);
  const label = stage?.name?.trim() || `stage ${index + 1}`;
  const errors = formState.errors.stages?.[index];
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-wrap items-start gap-2 rounded-lg border border-border bg-surface p-2 sm:flex-nowrap',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <div className="flex items-center">
        <Button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Reorder ${label}`}
          icon={<GripVertical aria-hidden />}
          className="cursor-grab touch-none"
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Move ${label} up`}
          icon={<ArrowUp aria-hidden />}
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Move ${label} down`}
          icon={<ArrowDown aria-hidden />}
          disabled={index === count - 1}
          onClick={() => onMove(index, index + 1)}
        />
      </div>
      <Controller
        control={control}
        name={`stages.${index}.color`}
        render={({ field }) => (
          <ColourPicker value={field.value} onChange={field.onChange} stageName={label} />
        )}
      />
      <FormField
        label={`Stage ${index + 1} name`}
        hideLabel
        error={errors?.name?.message}
        className="min-w-40 flex-1"
      >
        <Input {...register(`stages.${index}.name`)} placeholder="Stage name" autoComplete="off" />
      </FormField>
      <FormField
        label={`Win probability for ${label} (%)`}
        hideLabel
        error={errors?.probability?.message ?? errors?.color?.message}
        className="w-24"
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          placeholder="%"
          {...register(`stages.${index}.probability`, {
            setValueAs: (v: unknown) =>
              v === '' || v === null || v === undefined ? null : Number(v),
          })}
        />
      </FormField>
      <div className="flex items-center">
        <label className={radioLabel}>
          <input
            type="radio"
            name="won-stage"
            checked={Boolean(stage?.isWon)}
            onChange={onMarkWon}
            className="accent-success"
          />
          Won<span className="sr-only"> stage: {label}</span>
        </label>
        <label className={radioLabel}>
          <input
            type="radio"
            name="lost-stage"
            checked={Boolean(stage?.isLost)}
            onChange={onMarkLost}
            className="accent-danger"
          />
          Lost<span className="sr-only"> stage: {label}</span>
        </label>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Remove stage ${label}`}
          icon={<Trash2 aria-hidden />}
          onClick={onRemove}
          disabled={count <= 1}
        />
      </div>
    </li>
  );
}
