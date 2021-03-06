import jot from 'jot';
import { Logger } from 'winston';
import { reach } from 'sundae-collab-shared';
import { Version, Brick, DocumentState } from './store';
import { BadUpdate } from './errors';

/**
 * Applies jot operation on a given state, returning an updated state.
 */
export function applyOperation(op: jot.Operation, state: DocumentState): DocumentState {
  const [newValue, newMeta] = op.applyWithMeta(state.value, state.meta);
  return { version: state.version + 1, value: newValue, meta: newMeta };
}

/**
 * Iterates over a list of bricks sorted by version to find the index
 * of a brick with a specific version.
 */
function findVersionIndex(version: Version, history: Brick[]): number {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].version === version) {
      return i;
    }
  }
  throw new BadUpdate('Version not found.');
}

/**
 * Iterates over a list of states sorted by version to find the index
 * of a state that has version equal or lower to the version parameter.
 */
function findClosestShortcutIndex(version: Version, shortcuts: DocumentState[]): number {
  for (let i = shortcuts.length - 1; i >= 0; i -= 1) {
    if (shortcuts[i].version <= version) {
      return i;
    }
  }
  throw new BadUpdate('Missing shortcut.');
}

/**
 * Restores the state at a given version using history (a list of updates
 * with incrementing versions) and shortcuts (saved snapshots of content
 * with possible gaps between versions).
 * Both history and shortcuts must be sorted by version (ascending).
 */
function stateAtVersion(
  version: Version,
  history: Brick[],
  shortcuts: DocumentState[],
): DocumentState {
  const targetIndex = findVersionIndex(version, history);
  const closestShortcut = shortcuts[findClosestShortcutIndex(version, shortcuts)];
  const startIndex = findVersionIndex(closestShortcut.version + 1, history);
  const bricksToApply = history.slice(startIndex, targetIndex + 1);
  return bricksToApply.reduce(
    (state, brick) => applyOperation(brick.operation, state),
    closestShortcut,
  );
}

/**
 * Rebases an update made to possibly older version of a document so that
 * it can be applied on the new version while preserving the intention of
 * change. Returns a new brick with new  version. Assumes history
 * and shortcuts are sorted by version (ascending).
 */
export function rebaseUpdate(
  operation: jot.Operation,
  base: Version,
  history: Brick[],
  shortcuts: DocumentState[],
  log: Logger,
): Brick {
  if (base === history[history.length - 1].version) {
    // updating the newest version, don't have to rebase
    return { version: history[history.length - 1].version + 1, operation };
  }

  const bricksToRebaseAgainst = history.slice(findVersionIndex(base + 1, history));
  log.debug('REBASE against', bricksToRebaseAgainst);

  let baseState = stateAtVersion(base, history, shortcuts);
  let op = operation;

  bricksToRebaseAgainst.forEach((brick) => {
    const tmpOp = op.rebase(brick.operation);
    if (tmpOp === null) {
      log.debug('REBASE_CONFLICT a.rebase(b)', { a: op.toJSON(), b: brick.operation.toJSON() });
      op = op.rebase(brick.operation, { document: baseState.value });
    } else {
      op = tmpOp;
    }
    baseState = applyOperation(brick.operation, baseState);
  });

  return { version: baseState.version + 1, operation: op };
}

/**
 * Creates an operation that removes all selections belonging to a particular
 * user.
 */
export function clearSelections(id: string, doc: jot.Document, meta: jot.Meta) {
  const selects = Object.entries(meta.selections ?? {})
    .filter(([, field]) => Object.prototype.hasOwnProperty.call(field, id))
    .map(([path]) => {
      const [, nest] = reach(doc, path, jot);
      return nest(new jot.SELECT(id, null));
    });

  return (new jot.LIST(selects)).simplify();
}
