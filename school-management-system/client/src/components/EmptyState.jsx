import { FileX, Search } from 'lucide-react';

const EmptyState = ({ 
  icon: Icon = FileX, 
  title = 'No Data Found', 
  description = 'There are no items to display.',
  action,
  actionLabel = 'Add New'
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-500 text-center max-w-md mb-4">{description}</p>
      {action && (
        <button
          onClick={action}
          className="px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;

