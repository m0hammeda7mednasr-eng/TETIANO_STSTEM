import express from "express";
import { supabase as db } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { getAccessibleStoreIds } from "../models/index.js";
import {
  buildSupplierDetail,
  buildSupplierList,
  sanitizeDeliveryPayload,
  sanitizePaymentPayload,
  sanitizeSupplierPayload,
} from "../helpers/suppliers.js";

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const SUPPLIERS_SQL_FILE = "ADD_SUPPLIERS_MODULE.sql";
const SUPPLIERS_SELECT = [
  "id",
  "store_id",
  "code",
  "name",
  "contact_name",
  "phone",
  "email",
  "address",
  "payment_terms",
  "bank_name",
  "account_holder",
  "account_number",
  "iban",
  "wallet_number",
  "notes",
  "opening_balance",
  "is_active",
  "created_by",
  "created_at",
  "updated_at",
].join(",");
const SUPPLIER_ENTRIES_SELECT = [
  "id",
  "supplier_id",
  "store_id",
  "entry_type",
  "entry_date",
  "reference_code",
  "description",
  "amount",
  "payment_method",
  "payment_account",
  "items",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isSchemaCompatibilityError = (error) => {
  if (!error) {
    return false;
  }

  if (SCHEMA_ERROR_CODES.has(String(error.code || ""))) {
    return true;
  }

  const text =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return (
    text.includes("does not exist") ||
    text.includes("could not find the") ||
    text.includes("relation") ||
    text.includes("column")
  );
};

const handleSchemaError = (res) =>
  res.status(503).json({
    error:
      "Suppliers module is not ready yet. Run ADD_SUPPLIERS_MODULE.sql in Supabase first",
    setup_required: true,
    sql_file: SUPPLIERS_SQL_FILE,
  });

const getRequestedStoreId = (req) => {
  const candidates = [req.headers["x-store-id"], req.body?.store_id, req.query?.store_id];

  for (const value of candidates) {
    const normalized = String(value || "").trim();
    if (UUID_REGEX.test(normalized)) {
      return normalized;
    }
  }

  return null;
};

const resolveIsAdmin = (req) =>
  Boolean(req.user?.isAdmin || String(req.user?.role || "").toLowerCase() === "admin");

const getAdminStoreIds = async () => {
  const strategies = [
    async () => {
      const { data, error } = await db.from("stores").select("id");
      if (error) {
        throw error;
      }
      return (data || []).map((row) => String(row?.id || "").trim()).filter(Boolean);
    },
    async () => {
      const { data, error } = await db
        .from("products")
        .select("store_id")
        .not("store_id", "is", null)
        .limit(200);
      if (error) {
        throw error;
      }
      return Array.from(
        new Set(
          (data || []).map((row) => String(row?.store_id || "").trim()).filter(Boolean),
        ),
      );
    },
  ];

  for (const strategy of strategies) {
    try {
      const storeIds = await strategy();
      if (storeIds.length > 0) {
        return storeIds;
      }
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) {
        throw error;
      }
    }
  }

  return [];
};

const resolveStoreContext = async (req) => {
  const requestedStoreId = getRequestedStoreId(req);
  const isAdmin = resolveIsAdmin(req);

  if (isAdmin) {
    if (requestedStoreId) {
      return {
        isAdmin,
        storeId: requestedStoreId,
      };
    }

    const adminStoreIds = await getAdminStoreIds();
    if (adminStoreIds.length === 1) {
      return {
        isAdmin,
        storeId: adminStoreIds[0],
      };
    }

    if (adminStoreIds.length === 0) {
      throw createHttpError(400, "No connected store is available yet");
    }

    throw createHttpError(400, "Select a store first before opening suppliers");
  }

  const accessibleStoreIds = await getAccessibleStoreIds(req.user?.id);

  if (requestedStoreId) {
    if (
      accessibleStoreIds.length === 0 ||
      !accessibleStoreIds.includes(requestedStoreId)
    ) {
      throw createHttpError(403, "Access denied for the selected store");
    }

    return {
      isAdmin,
      storeId: requestedStoreId,
    };
  }

  if (accessibleStoreIds.length === 1) {
    return {
      isAdmin,
      storeId: accessibleStoreIds[0],
    };
  }

  if (accessibleStoreIds.length === 0) {
    throw createHttpError(400, "No store is connected to this account yet");
  }

  throw createHttpError(400, "Select a store first before opening suppliers");
};

const loadStoreSuppliers = async (storeId) => {
  const { data, error } = await db
    .from("suppliers")
    .select(SUPPLIERS_SELECT)
    .eq("store_id", storeId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

const loadStoreSupplierEntries = async (storeId) => {
  const { data, error } = await db
    .from("supplier_entries")
    .select(SUPPLIER_ENTRIES_SELECT)
    .eq("store_id", storeId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

const findSupplierForStore = async (storeId, supplierId) => {
  const { data, error } = await db
    .from("suppliers")
    .select(SUPPLIERS_SELECT)
    .eq("store_id", storeId)
    .eq("id", supplierId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const requireSupplierForStore = async (storeId, supplierId) => {
  const supplier = await findSupplierForStore(storeId, supplierId);
  if (!supplier) {
    throw createHttpError(404, "Supplier not found for the selected store");
  }

  return supplier;
};

router.use(authenticateToken, requirePermission("can_view_products"));

router.get("/", async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const [suppliers, entries] = await Promise.all([
      loadStoreSuppliers(storeId),
      loadStoreSupplierEntries(storeId),
    ]);
    const data = buildSupplierList(suppliers, entries);

    res.json({
      data,
      meta: {
        store_id: storeId,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);

    if (isSchemaCompatibilityError(error)) {
      return handleSchemaError(res);
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to fetch suppliers",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const supplier = await requireSupplierForStore(storeId, req.params.id);
    const entries = await loadStoreSupplierEntries(storeId);
    const detail = buildSupplierDetail(
      supplier,
      entries.filter((entry) => entry?.supplier_id === supplier.id),
    );

    res.json({
      supplier: detail,
      meta: {
        store_id: storeId,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching supplier detail:", error);

    if (isSchemaCompatibilityError(error)) {
      return handleSchemaError(res);
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to fetch supplier detail",
    });
  }
});

router.post("/", requirePermission("can_edit_products"), async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const payload = sanitizeSupplierPayload(req.body);

    if (!payload.name) {
      return res.status(400).json({ error: "Supplier name is required" });
    }

    const { data, error } = await db
      .from("suppliers")
      .insert({
        ...payload,
        store_id: storeId,
        created_by: req.user?.id || null,
      })
      .select(SUPPLIERS_SELECT)
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    console.error("Error creating supplier:", error);

    if (isSchemaCompatibilityError(error)) {
      return handleSchemaError(res);
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to create supplier",
    });
  }
});

router.put("/:id", requirePermission("can_edit_products"), async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    await requireSupplierForStore(storeId, req.params.id);

    const payload = sanitizeSupplierPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ error: "Supplier name is required" });
    }

    const { data, error } = await db
      .from("suppliers")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("id", req.params.id)
      .select(SUPPLIERS_SELECT)
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error("Error updating supplier:", error);

    if (isSchemaCompatibilityError(error)) {
      return handleSchemaError(res);
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to update supplier",
    });
  }
});

router.post(
  "/:id/deliveries",
  requirePermission("can_edit_products"),
  async (req, res) => {
    try {
      const { storeId } = await resolveStoreContext(req);
      const supplier = await requireSupplierForStore(storeId, req.params.id);
      const payload = sanitizeDeliveryPayload(req.body);

      if (!payload.entry_date) {
        return res.status(400).json({ error: "Delivery date is required" });
      }

      if (!Array.isArray(payload.items) || payload.items.length === 0) {
        return res.status(400).json({
          error: "Add at least one received product before saving the delivery",
        });
      }

      const { data, error } = await db
        .from("supplier_entries")
        .insert({
          supplier_id: supplier.id,
          store_id: storeId,
          entry_type: "delivery",
          entry_date: payload.entry_date,
          reference_code: payload.reference_code || null,
          description: payload.description || null,
          amount: payload.amount,
          payment_method: payload.payment_method || null,
          payment_account: payload.payment_account || null,
          items: payload.items,
          notes: payload.notes || null,
          created_by: req.user?.id || null,
        })
        .select(SUPPLIER_ENTRIES_SELECT)
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json(data);
    } catch (error) {
      console.error("Error creating supplier delivery:", error);

      if (isSchemaCompatibilityError(error)) {
        return handleSchemaError(res);
      }

      res.status(error.status || 500).json({
        error: error.status ? error.message : "Failed to add supplier delivery",
      });
    }
  },
);

router.post(
  "/:id/payments",
  requirePermission("can_edit_products"),
  async (req, res) => {
    try {
      const { storeId } = await resolveStoreContext(req);
      const supplier = await requireSupplierForStore(storeId, req.params.id);
      const payload = sanitizePaymentPayload(req.body);

      if (!payload.entry_date) {
        return res.status(400).json({ error: "Payment date is required" });
      }

      if (payload.amount <= 0) {
        return res.status(400).json({ error: "Payment amount must be greater than 0" });
      }

      const { data, error } = await db
        .from("supplier_entries")
        .insert({
          supplier_id: supplier.id,
          store_id: storeId,
          entry_type: "payment",
          entry_date: payload.entry_date,
          reference_code: payload.reference_code || null,
          description: payload.description || null,
          amount: payload.amount,
          payment_method: payload.payment_method || null,
          payment_account: payload.payment_account || null,
          items: [],
          notes: payload.notes || null,
          created_by: req.user?.id || null,
        })
        .select(SUPPLIER_ENTRIES_SELECT)
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json(data);
    } catch (error) {
      console.error("Error creating supplier payment:", error);

      if (isSchemaCompatibilityError(error)) {
        return handleSchemaError(res);
      }

      res.status(error.status || 500).json({
        error: error.status ? error.message : "Failed to add supplier payment",
      });
    }
  },
);

export default router;
