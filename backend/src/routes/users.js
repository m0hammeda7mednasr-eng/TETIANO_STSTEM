import express from "express";
import bcrypt from "bcryptjs";
import { authenticateToken } from "../middleware/auth.js";
import {
  requirePermission,
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  normalizePermissions,
  normalizeRole,
} from "../middleware/permissions.js";
import { supabase } from "../supabaseClient.js";

const router = express.Router();
const MAX_USERS_LIST_LIMIT = 200;

const parseListLimit = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(MAX_USERS_LIST_LIMIT, parsed);
};

const parseListOffset = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
};

const shouldIncludeCount = (value) =>
  ["1", "true", "yes"].includes(String(value || "").toLowerCase());

const shouldUseCompactSelect = (value) =>
  ["1", "true", "yes"].includes(String(value || "").toLowerCase());

// Get all users (Admin only)
router.get(
  "/",
  authenticateToken,
  requirePermission("can_manage_users"),
  async (req, res) => {
    try {
      const limit = parseListLimit(req.query.limit);
      const offset = parseListOffset(req.query.offset);
      const includeCount = shouldIncludeCount(req.query.include_count);
      const compact = shouldUseCompactSelect(req.query.compact);
      const selectClause = compact
        ? `
        id,
        email,
        name,
        role,
        is_active,
        created_at
      `
        : `
        id,
        email,
        name,
        role,
        is_active,
        created_at,
        permissions (*)
      `;

      let query = supabase
        .from("users")
        .select(selectClause, includeCount ? { count: "exact" } : undefined)
        .order("created_at", { ascending: false });

      if (limit !== null) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data: users, error, count } = await query;

      if (error) throw error;

      if (includeCount) {
        return res.json({
          data: users || [],
          total: Number.isFinite(count) ? count : (users || []).length,
          limit,
          offset,
        });
      }

      res.json(users || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Create new user (Admin only)
router.post(
  "/create",
  authenticateToken,
  requirePermission("can_manage_users"),
  async (req, res) => {
    try {
      const { email, password, name, role, permissions } = req.body;

      if (!email || !password || !name) {
        return res
          .status(400)
          .json({ error: "Email, password, and name are required" });
      }

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert([
          {
            email,
            password: hashedPassword,
            name,
            role: normalizeRole(role || "user"),
            created_by: req.user.id,
            is_active: true,
          },
        ])
        .select()
        .single();

      if (userError) throw userError;

      // Create permissions
      const { error: permError } = await supabase.from("permissions").insert([
        {
          user_id: newUser.id,
          ...permissions,
        },
      ]);

      if (permError) throw permError;

      res.json({
        success: true,
        message: "User created successfully",
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
        },
      });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Update user permissions and role (Admin only)
router.put(
  "/:userId",
  authenticateToken,
  requirePermission("can_manage_users"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { permissions, role } = req.body; // Include role

      // Update user role if provided
      if (role) {
        const { error: roleError } = await supabase
          .from("users")
          .update({ role: normalizeRole(role) })
          .eq("id", userId);
        if (roleError) throw roleError;
      }

      // Update permissions
      if (permissions) {
        // Check if permissions exist
        const { data: existing } = await supabase
          .from("permissions")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (existing) {
          // Update existing permissions
          const { error } = await supabase
            .from("permissions")
            .update({
              ...permissions,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);

          if (error) throw error;
        } else {
          // Create new permissions if they don't exist
          const { error } = await supabase.from("permissions").insert([
            {
              user_id: userId,
              ...permissions,
            },
          ]);

          if (error) throw error;
        }
      }

      res.json({ success: true, message: "User updated successfully" });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Delete user (Admin only)
router.delete(
  "/:userId",
  authenticateToken,
  requirePermission("can_manage_users"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Prevent deleting yourself
      if (userId === req.user.id) {
        return res
          .status(400)
          .json({ error: "Cannot delete your own account" });
      }

      // Check if user is admin
      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (user && user.role === "admin") {
        return res.status(400).json({ error: "Cannot delete admin users" });
      }

      // Delete user (permissions will be deleted automatically due to CASCADE)
      const { error } = await supabase.from("users").delete().eq("id", userId);

      if (error) throw error;

      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get current user's stores
router.get("/me/stores", authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_stores")
      .select("stores (*)")
      .eq("user_id", req.user.id);

    if (error) throw error;

    const stores = data.map((item) => item.stores);
    res.json(stores);
  } catch (error) {
    console.error("Error fetching user stores:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user info (no admin required) - MUST be before /:userId
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, name, role, is_active, created_at")
      .eq("id", req.user.id)
      .single();

    if (error) throw error;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let normalizedPermissions = { ...DEFAULT_PERMISSIONS };
    const normalizedUserRole = normalizeRole(user.role);

    if (normalizedUserRole === "admin") {
      for (const key of PERMISSION_KEYS) {
        normalizedPermissions[key] = true;
      }
    } else {
      const { data: permissionsData, error: permissionsError } = await supabase
        .from("permissions")
        .select("*")
        .eq("user_id", req.user.id)
        .single();

      if (permissionsError && permissionsError.code !== "PGRST116") {
        throw permissionsError;
      }

      normalizedPermissions = normalizePermissions(permissionsData);
    }

    res.json({
      ...user,
      role: normalizedUserRole,
      permissions: normalizedPermissions,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user permissions - MUST be before /:userId
router.get("/me/permissions", authenticateToken, async (req, res) => {
  try {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (userError && userError.code !== "PGRST116") {
      throw userError;
    }

    if (normalizeRole(userData?.role) === "admin") {
      const adminPermissions = { ...DEFAULT_PERMISSIONS };
      for (const key of PERMISSION_KEYS) {
        adminPermissions[key] = true;
      }
      return res.json(adminPermissions);
    }

    const { data, error } = await supabase
      .from("permissions")
      .select("*")
      .eq("user_id", req.user.id)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    res.json(normalizePermissions(data));
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single user by ID (Admin only)
router.get(
  "/:userId",
  authenticateToken,
  requirePermission("can_manage_users"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      const { data: user, error } = await supabase
        .from("users")
        .select(
          `
        id,
        email,
        name,
        role,
        is_active,
        created_at,
        permissions (*),
        shopify_credentials (*)
      `,
        )
        .eq("id", userId)
        .single();

      if (error) throw error;

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;
