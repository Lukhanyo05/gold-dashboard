import { Schema, model, HydratedDocument } from 'mongoose';
import { IPlaybook } from '../types';

export type PlaybookDocument = HydratedDocument<IPlaybook>;

const PlaybookSchema = new Schema<IPlaybook>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
    description: { type: String, trim: true, maxlength: 1000 },
    rules: { type: [String], default: [] },
    color: { type: String, trim: true, default: '#d4af37' },
  },
  { timestamps: true }
);

export const Playbook = model<IPlaybook>('Playbook', PlaybookSchema);
