import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type Todo = {
  id: number;
  title: string;
  done: boolean;
};

export enum Filter {
  All = 'all',
  Active = 'active',
  Done = 'done',
}

export type TodoState = {
  items: Array<Todo>;
  remaining: number;
  total: number;
};

export interface Spec extends TurboModule {
  /** Todos matching `filter`, plus counts over all todos. */
  getState(filter: Filter): TodoState;
  /** Adds a todo; returns false if the title is blank. */
  add(title: string): boolean;
  /** Flips `done`; returns false if no todo has `id`. */
  toggle(id: number): boolean;
  /** Deletes a todo; returns false if no todo has `id`. */
  remove(id: number): boolean;
  /** Deletes every completed todo; returns how many were removed. */
  clearDone(): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeTodoStore');
