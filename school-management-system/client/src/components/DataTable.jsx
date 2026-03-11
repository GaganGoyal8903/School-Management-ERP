import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

const DataTable = ({ 
  columns, 
  data, 
  loading, 
  pagination, 
  onPageChange,
  onSearch,
  searchPlaceholder = 'Search...'
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Safety check: ensure data is always an array
  const safeData = Array.isArray(data) ? data : [];

  const handleSearch = (e) => {
    e.preventDefault();
    onSearch?.(searchTerm);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Search */}
      {onSearch && (
        <div className="p-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366] focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
            >
              Search
            </button>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {Array.isArray(columns) && columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  style={{ width: column.width }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : safeData.length === 0 ? (
              <tr>
                <td colSpan={Array.isArray(columns) ? columns.length : 0} className="px-6 py-12 text-center text-gray-500">
                  No data available
                </td>
              </tr>
            ) : (
              safeData.map((row, rowIndex) => (
                <tr key={row._id || rowIndex} className="hover:bg-gray-50">
                  {columns.map((column) => (
                    <td key={column.key} className="px-6 py-4 text-sm text-gray-700">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <div className="text-sm text-gray-500">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 text-sm text-gray-600">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;

