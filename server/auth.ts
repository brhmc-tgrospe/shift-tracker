import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';

// Auth Middleware
export const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    (req as any).user = user;
    next();
  });
};

export const requireDeveloper = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== 'Developer') {
    return res.status(403).json({ error: 'Developer access required' });
  }
  next();
};

export const requireAdminOrDeveloper = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || (user.role !== 'Developer' && user.role !== 'Admin')) {
    return res.status(403).json({ error: 'Admin or Developer access required' });
  }
  next();
};
