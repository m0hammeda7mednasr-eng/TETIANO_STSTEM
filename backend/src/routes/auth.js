import express from "express";
import { supabase } from "../supabaseClient.js";
import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import { normalizeRole } from "../middleware/permissions.js";

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "جميع الحقول مطلوبة" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Create user in Supabase
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert([{ email, password: hashedPassword, name }])
      .select();

    if (userError) {
      if (userError.code === "23505") {
        return res
          .status(400)
          .json({ error: "البريد الإلكتروني مستخدم بالفعل" });
      }
      return res.status(400).json({ error: userError.message });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: userData[0].id,
        email: userData[0].email,
        role: normalizeRole(userData[0].role || "user"),
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: userData[0].id,
        email: userData[0].email,
        name: userData[0].name,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء إنشاء الحساب" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    }

    // Fetch user
    const { data: users, error } = await supabase
      .from("users")
      .select()
      .eq("email", email);

    if (error || !users || users.length === 0) {
      return res
        .status(401)
        .json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    const user = users[0];

    // Verify password
    const passwordMatch = await bcryptjs.compare(password, user.password);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: normalizeRole(user.role || "user"),
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
  }
});

// Verify Token
router.post("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
