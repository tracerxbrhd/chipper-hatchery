import { applyTowerCommand, TOWER_CONFIG, towerStateHash } from './engine';
import type { TowerCheckpointInput, TowerCommand, TowerRunDTO, TowerState } from './types';
/** One frozen batch stays in memory until acknowledged; retry never invents a new UUID.
 * Inputs after a wave must wait for its checkpoint because commands precede all batch ticks. */
export class TowerCheckpointJournal {
  state: TowerState;
  run: TowerRunDTO;
  private commands: TowerCommand[] = [];
  private ticks = 0;
  pending: TowerCheckpointInput | null = null;
  constructor(run: TowerRunDTO) {
    if (!run.checkpoint) throw new Error('У этой партии уже есть итог');
    this.run = run; this.state = structuredClone(run.checkpoint);
  }
  command(command: TowerCommand): void {
    if (this.pending) throw new Error('Сначала сохраните предыдущие действия');
    if (this.commands.length >= TOWER_CONFIG.maxCommands) throw new Error('Сначала сохраните предыдущие действия');
    if (this.ticks) throw new Error('Сначала сохраните завершённую волну');
    applyTowerCommand(this.state, command); this.commands.push(structuredClone(command));
  }
  stepped(count: number): void {
    if (this.pending) throw new Error('Checkpoint ожидает подтверждения');
    this.ticks += count;
  }
  get unsavedCommands(): number { return this.commands.length; }
  get unsavedTicks(): number { return this.ticks; }
  get hasChanges(): boolean { return this.commands.length > 0 || this.ticks > 0; }
  prepare(operationId: () => string = () => crypto.randomUUID()): TowerCheckpointInput | null {
    if (!this.pending && this.hasChanges) this.pending = {
      operationId: operationId(), runId: this.run.runId, revision: this.run.revision,
      commands: structuredClone(this.commands), ticks: this.ticks, expectedHash: towerStateHash(this.state),
    };
    return this.pending;
  }
  acknowledge(run: TowerRunDTO): void {
    if (run.runId !== this.run.runId) throw new Error('Ответ относится к другой партии');
    this.restore(run);
  }
  restore(run: TowerRunDTO): void {
    if (!run.checkpoint) throw new Error('У этой партии уже есть итог');
    this.run = run; this.state = structuredClone(run.checkpoint); this.commands = []; this.ticks = 0; this.pending = null;
  }
}
