import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const router = Router();

function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET as string;
  if (!secret) throw new Error('JWT_SECRET not configured');

  const options: jwt.SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']) ?? '7d',
  };

  return jwt.sign({ userId }, secret, options);
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 chars' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, name });

    const token = signToken(user._id.toString());
    res.status(201).json({ token, user: { id: user._id, email, name } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user._id.toString());
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/me', async (_req, res) => {
  res.json({ message: 'me endpoint' });
});

export default router;