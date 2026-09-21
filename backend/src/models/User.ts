import { Schema, model, HydratedDocument } from 'mongoose';

export interface IUser {
  email: string;
  passwordHash: string;
  name?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', UserSchema);