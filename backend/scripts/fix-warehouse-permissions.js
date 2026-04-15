#!/usr/bin/env node

/**
 * Fix warehouse permissions for existing users
 * This script ensures users who can edit products also get warehouse edit permissions
 */

import { supabase } from "../src/supabaseClient.js";

async function fixWarehousePermissions() {
  console.log("🔧 Fixing warehouse permissions for existing users...");

  try {
    // Get all users who can edit products but don't have warehouse edit permissions
    const { data: usersToFix, error: fetchError } = await supabase
      .from("permissions")
      .select(
        "user_id, can_edit_products, can_edit_warehouse, can_view_warehouse",
      )
      .eq("can_edit_products", true)
      .eq("can_edit_warehouse", false);

    if (fetchError) {
      throw fetchError;
    }

    if (!usersToFix || usersToFix.length === 0) {
      console.log("✅ No users need warehouse permission fixes");
      return;
    }

    console.log(
      `📋 Found ${usersToFix.length} users who need warehouse edit permissions`,
    );

    // Update permissions for these users
    const { error: updateError } = await supabase
      .from("permissions")
      .update({
        can_edit_warehouse: true,
        can_view_warehouse: true,
        updated_at: new Date().toISOString(),
      })
      .eq("can_edit_products", true)
      .eq("can_edit_warehouse", false);

    if (updateError) {
      throw updateError;
    }

    console.log(
      `✅ Successfully updated warehouse permissions for ${usersToFix.length} users`,
    );

    // Also check for users who might not have warehouse permissions at all
    const { data: allUsers, error: allUsersError } = await supabase
      .from("permissions")
      .select("user_id, can_view_warehouse, can_edit_warehouse")
      .is("can_view_warehouse", null);

    if (allUsersError && allUsersError.code !== "PGRST116") {
      console.warn(
        "⚠️  Could not check for users with missing warehouse columns:",
        allUsersError.message,
      );
    } else if (allUsers && allUsers.length > 0) {
      console.log(
        `📋 Found ${allUsers.length} users with missing warehouse permission columns`,
      );

      // This shouldn't happen if migration ran properly, but let's handle it
      const { error: fixMissingError } = await supabase
        .from("permissions")
        .update({
          can_view_warehouse: true,
          can_edit_warehouse: false,
          updated_at: new Date().toISOString(),
        })
        .is("can_view_warehouse", null);

      if (fixMissingError) {
        console.warn(
          "⚠️  Could not fix missing warehouse columns:",
          fixMissingError.message,
        );
      } else {
        console.log("✅ Fixed missing warehouse permission columns");
      }
    }

    console.log("🎉 Warehouse permissions fix completed successfully!");
  } catch (error) {
    console.error("❌ Error fixing warehouse permissions:", error);
    process.exit(1);
  }
}

// Run the fix if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixWarehousePermissions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Script failed:", error);
      process.exit(1);
    });
}

export { fixWarehousePermissions };
