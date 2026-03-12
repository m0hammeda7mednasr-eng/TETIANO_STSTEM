// Auth utilities
export const getToken = () => localStorage.getItem("token");

export const saveToken = (token) => localStorage.setItem("token", token);

export const removeToken = () => localStorage.removeItem("token");

export const isAuthenticated = () => {
  return !!getToken();
};

// Format utilities
export const formatCurrency = (amount, currency = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
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
