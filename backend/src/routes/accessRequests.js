import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { applyUserFilter } from "../helpers/dataFilter.js";
import { isAdmin } from "../middleware/permissions.js";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// Get my requests
router.get("/my-requests", authenticateToken, async (req, res) => {
  try {
    let query = supabase
      .from("access_requests")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply role-based filtering
    query = applyUserFilter(
      query,
      req.user.id,
      req.user.role,
      "access_requests",
    );

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ error: "Failed to fetch access requests" });
  }
});

// Get all requests (Admin only)
router.get("/all", authenticateToken, isAdmin, async (req, res) => {
  try {
    let query = supabase
      .from("access_requests")
      .select(
        `
        *,
        users!access_requests_user_id_fkey (name, email)
      `,
      )
      .order("created_at", { ascending: false });

    // Apply role-based filtering (admins see all, employees see only their own)
    query = applyUserFilter(
      query,
      req.user.id,
      req.user.role,
      "access_requests",
    );

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error("Error fetching all requests:", error);
    res.status(500).json({ error: "Failed to fetch access requests" });
  }
});

// Create new request
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { permission_requested, reason } = req.body;
    const userId = req.user.id;

    if (!permission_requested || !reason) {
      return res
        .status(400)
        .json({ error: "Permission and reason are required" });
    }

    // Check if there's already a pending request for this permission
    let checkQuery = supabase
      .from("access_requests")
      .select("id")
      .eq("permission_requested", permission_requested)
      .eq("status", "pending");

    // Apply role-based filtering for the check
    checkQuery = applyUserFilter(
      checkQuery,
      userId,
      req.user.role,
      "access_requests",
    );

    const { data: existing } = await checkQuery.single();

    if (existing) {
      return res.status(400).json({
        error: "لديك طلب قيد المراجعة بالفعل لهذه الصلاحية",
      });
    }

    const { data, error } = await supabase
      .from("access_requests")
      .insert([
        {
          user_id: userId,
          permission_requested,
          reason,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, request: data });
  } catch (error) {
    console.error("Error creating request:", error);
    res.status(500).json({ error: "Failed to create access request" });
  }
});

// Approve/Reject request (Admin only)
router.put("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;
    const userId = req.user.id;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Get request details with role-based filtering
    let requestQuery = supabase
      .from("access_requests")
      .select("*")
      .eq("id", id);

    // Apply role-based filtering (admins can access any request, employees only their own)
    requestQuery = applyUserFilter(
      requestQuery,
      userId,
      req.user.role,
      "access_requests",
    );

    const { data: request, error: fetchError } = await requestQuery.single();

    if (fetchError || !request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Update request status
    const { error: updateError } = await supabase
      .from("access_requests")
      .update({
        status,
        admin_notes,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // If approved, update user permissions
    if (status === "approved") {
      const { data: permissions } = await supabase
        .from("permissions")
        .select("*")
        .eq("user_id", request.user_id)
        .single();

      if (permissions) {
        // Update existing permissions
        await supabase
          .from("permissions")
          .update({
            [request.permission_requested]: true,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", request.user_id);
      } else {
        // Create new permissions
        await supabase.from("permissions").insert([
          {
            user_id: request.user_id,
            [request.permission_requested]: true,
          },
        ]);
      }
    }

    res.json({ success: true, message: "Request updated successfully" });
  } catch (error) {
    console.error("Error updating request:", error);
    res.status(500).json({ error: "Failed to update access request" });
  }
});

export default router;
