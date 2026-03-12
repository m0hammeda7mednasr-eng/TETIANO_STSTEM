// Loading Component
import React from "react";
import { Loader } from "lucide-react";

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-96">
      <Loader className="animate-spin text-blue-600" size={40} />
    </div>
  );
}

// Error Alert Component
import { AlertCircle } from "lucide-react";

export function ErrorAlert({ message, onClose }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <AlertCircle className="text-red-600" size={20} />
        <p className="text-red-800">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-red-600 hover:text-red-800 font-bold"
        >
          ×
        </button>
      )}
    </div>
  );
}

// Success Alert Component
export function SuccessAlert({ message, onClose }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="text-green-600 font-bold">✓</div>
        <p className="text-green-800">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-green-600 hover:text-green-800 font-bold"
        >
          ×
        </button>
      )}
    </div>
  );
}

// Empty State Component
import { Package } from "lucide-react";

export function EmptyState({
  icon: Icon = Package,
  title = "No Data Found",
  message = "",
}) {
  return (
    <div className="bg-white rounded-lg shadow p-12 text-center">
      <Icon size={48} className="mx-auto text-gray-400 mb-4" />
      <p className="text-gray-800 font-semibold mb-2">{title}</p>
      {message && <p className="text-gray-500 text-sm">{message}</p>}
    </div>
  );
}

// Pagination Component
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, totalPages, onPageChange }) {
  return (
    <div className="flex items-center justify-between mt-6">
      <p className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="flex items-center gap-1 px-3 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        <button
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex items-center gap-1 px-3 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
