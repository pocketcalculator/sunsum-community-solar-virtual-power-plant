/**
 * Public interface of the operator pipeline workspace.
 *
 * Browser-safe throughout: nothing here imports a backend module. The page
 * performs the authorized read and hands this feature the projected payload.
 *
 * The wire vocabularies and the default filter state are deliberately not
 * exported: they are this feature's internals, reached through relative
 * imports by the components that need them.
 */
export { OperatorPipeline } from "./components/OperatorPipeline";
export type { OperatorPipelineProps } from "./components/OperatorPipeline";
export { SAMPLE_PIPELINE } from "./model/samplePipeline";
export {
  formatCapacityKw,
  pipelineQueryString,
  toPipelineView,
  type PipelineCard,
  type PipelineDataSource,
  type PipelineFilters,
  type PipelineStageCount,
  type PipelineView,
} from "./model/pipeline";
