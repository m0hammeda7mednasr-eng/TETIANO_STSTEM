import React, { useState, useEffect } from "react";
import axios from "axios";
import Sidebar from "../components/Sidebar";
import { Users, Search, AlertCircle, Loader, ExternalLink } from "lucide-react";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const response = await axios.get("/api/dashboard/customers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomers(response.data.data || []);
    } catch (err) {
      setError("Failed to load customers");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Customers</h1>
            <p className="text-gray-600">
              Manage and view all your store customers
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="mb-6">
            <div className="relative">
              <Search
                className="absolute left-3 top-3 text-gray-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Loader className="animate-spin text-blue-600" size={40} />
            </div>
          ) : filteredCustomers.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Orders
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Total Spent
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">
                        {customer.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <a
                          href={`mailto:${customer.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {customer.email}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {customer.phone || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {customer.city && customer.country
                          ? `${customer.city}, ${customer.country}`
                          : "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                        {customer.orders_count || 0}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-green-600">
                        {parseFloat(customer.total_spent || 0).toFixed(2)} LE
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(customer.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Users size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No customers found</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
