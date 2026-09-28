import { Schema, model, HydratedDocument } from 'mongoose';
import { IDailyJournal } from '../types';

export type DailyJournalDocument = HydratedDocument<IDailyJournal>;

const DailyJournalSchema = new Schema<IDailyJournal>(
  {
    date: { type: String, required: true, unique: true, index: true }, // YYYY-MM-DD
    mood: { type: Number, min: 1, max: 5, default: null },
    note: { type: String, default: '', maxlength: 5000 },
  },
  { timestamps: true }
);

export const DailyJournal = model<IDailyJournal>('DailyJournal', DailyJournalSchema);
