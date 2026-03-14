export const getJwtSecret = () => {
  const configuredSecret = String(process.env.JWT_SECRET || "").trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "test") {
    return "test-secret-key";
  }

  throw new Error("JWT_SECRET is not configured");
};
