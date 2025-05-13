const { query } = require("../routes/utils/MySql"); // Adjust path if needed

(async () => {
  try {
    const result = await query("SELECT 1 + 1 AS result");
    console.log("✅ MySQL connected. Test query result:", result[0].result);
    process.exit(0); // exit cleanly
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
    process.exit(1); // exit with error
  }
})();
