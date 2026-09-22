import type { z } from 'zod';
import type { createPipelineSchema, CreatePipelineInput, Pipeline } from '@leados/shared';
import { STAGE_COLORS } from './stage-palette';

export type PipelineFormIn = z.input<typeof createPipelineSchema>;
export type PipelineFormOut = z.output<typeof createPipelineSchema>;
export type StageFormValue = PipelineFormIn['stages'][number];

const color = (i: number) => STAGE_COLORS[i % STAGE_COLORS.length]?.hex ?? null;

/** Sensible starting stages for a brand-new pipeline. */
export function defaultStages(): StageFormValue[] {
  return [
    { name: 'New', color: color(1), probability: 10, isWon: false, isLost: false },
    { name: 'Qualified', color: color(0), probability: 25, isWon: false, isLost: false },
    { name: 'Proposal', color: color(6), probability: 50, isWon: false, isLost: false },
    { name: 'Won', color: color(4), probability: 100, isWon: true, isLost: false },
    { name: 'Lost', color: color(8), probability: 0, isWon: false, isLost: true },
  ];
}

export function newStage(index: number): StageFormValue {
  return { name: '', color: color(index), probability: null, isWon: false, isLost: false };
}

export function formValuesFrom(pipeline: Pipeline | null): PipelineFormIn {
  if (!pipeline) return { name: '', isDefault: false, stages: defaultStages() };
  return {
    name: pipeline.name,
    isDefault: pipeline.isDefault,
    stages: pipeline.stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      probability: s.probability,
      isWon: s.isWon,
      isLost: s.isLost,
    })),
  };
}

/** Request body: stages in display order; existing stages keep their id, new ones have none. */
export function toPipelinePayload(values: PipelineFormOut): CreatePipelineInput {
  return {
    name: values.name,
    isDefault: values.isDefault,
    stages: values.stages.map(({ id, name, color, probability, isWon, isLost }) => ({
      ...(id ? { id } : {}),
      name,
      color: color ?? null,
      probability: probability ?? null,
      isWon,
      isLost,
    })),
  };
}
