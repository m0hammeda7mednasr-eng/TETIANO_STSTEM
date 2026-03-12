import express from 'express';
import jwt from 'jsonwebtoken';
import { isAdmin } from '../middleware/permissions.js';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check for admin role
router.use(verifyToken, isAdmin);

// =================================================================
// User Management
// =================================================================

// Get all users with their roles and permissions
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        name,
        role,
        permissions (*)
      `);

    if (error) throw error;
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a user's role
router.put('/users/:userId/role', async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a user's permissions
router.put('/users/:userId/permissions', async (req, res) => {
  const { userId } = req.params;
  const permissions = req.body;

  try {
    const { data, error } = await supabase
      .from('permissions')
      .update(permissions)
      .eq('user_id', userId)
      .select();

    if (error) {
      // If the user has no permissions row yet, create one
      if (error.code === 'PGRST204') {
        const { data: newData, error: newError } = await supabase
          .from('permissions')
          .insert({ user_id: userId, ...permissions })
          .select();
        if (newError) throw newError;
        return res.json(newData);
      }
      throw error;
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =================================================================
// Store Management
// =================================================================

// Get all stores
router.get('/stores', async (req, res) => {
  try {
    const { data: stores, error } = await supabase.from('stores').select('*');
    if (error) throw error;
    res.json(stores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new store
router.post('/stores', async (req, res) => {
  const { name } = req.body;
  try {
    const { data, error } = await supabase
      .from('stores')
      .insert({ name, created_by: req.user.id })
      .select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a store
router.put('/stores/:storeId', async (req, res) => {
  const { storeId } = req.params;
  const { name } = req.body;
  try {
    const { data, error } = await supabase
      .from('stores')
      .update({ name })
      .eq('id', storeId)
      .select();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a store
router.delete('/stores/:storeId', async (req, res) => {
  const { storeId } = req.params;
  try {
    const { error } = await supabase.from('stores').delete().eq('id', storeId);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// =================================================================
// User-Store Management
// =================================================================

// Get all users for a store
router.get('/stores/:storeId/users', async (req, res) => {
  const { storeId } = req.params;
  try {
    const { data, error } = await supabase
      .from('user_stores')
      .select('user_id')
      .eq('store_id', storeId);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Grant a user access to a store
router.post('/stores/:storeId/users', async (req, res) => {
  const { storeId } = req.params;
  const { userId } = req.body;
  try {
    const { data, error } = await supabase
      .from('user_stores')
      .insert({ user_id: userId, store_id: storeId })
      .select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke a user's access to a store
router.delete('/stores/:storeId/users/:userId', async (req, res) => {
  const { storeId, userId } = req.params;
  try {
    const { error } = await supabase
      .from('user_stores')
      .delete()
      .eq('user_id', userId)
      .eq('store_id', storeId);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
