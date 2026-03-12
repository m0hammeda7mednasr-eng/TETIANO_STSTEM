// Auth utilities
export const getToken = () => localStorage.getItem("token");

export const saveToken = (token) => localStorage.setItem("token", token);

export const removeToken = () => localStorage.removeItem("token");

export const isAuthenticated = () => {
  return !!getToken();
};

// Format utilities
export const CURRENCY_LABEL = "LE";

export const formatCurrency = (amount) => {
  const numericAmount = Number(amount);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount)} ${CURRENCY_LABEL}`;
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString("ar-EG");
};

export const formatDateTime = (date) => {
  return new Date(date).toLocaleString("ar-EG");
};

// Validation utilities
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePassword = (password) => {
  return password.length >= 8;
};

// Array utilities
export const paginate = (array, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  return array.slice(offset, offset + limit);
};

export const getTotalPages = (total, limit = 20) => {
  return Math.ceil(total / limit);
};
