import type { Database } from './database.types';

export type Estatus = Database['public']['Enums']['estatus_usuario'];

export const ESTATUS_INFO: Record<Estatus, { label: string; className: string }> = {
  activo: { label: 'Activo', className: 'badge-success' },
  inactivo: { label: 'Inactivo', className: 'badge-error' }
};
