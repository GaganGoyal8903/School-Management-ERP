import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Bus, MapPin, Plus, Edit, Trash2, Phone, User, Route, Navigation } from 'lucide-react';
import L from 'leaflet';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { 
  getBuses, 
  createBus, 
  updateBus, 
  deleteBus,
  updateBusLocation,
  getBusLocation
} from '../services/api';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/bus-school.svg',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

// Component to update map center
const MapUpdater = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 15);
    }
  }, [center, map]);
  return null;
};

const BusTracking = () => {
  const { isAdmin } = useAuth();
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [mapCenter, setMapCenter] = useState([28.6139, 77.2090]); // Default: Delhi
  
  const [formData, setFormData] = useState({
    busNumber: '',
    registrationNumber: '',
    driverName: '',
    driverPhone: '',
    driverLicense: '',
    routeName: '',
    routeStops: [],
    capacity: 50,
    currentStatus: 'Active'
  });

  const [locationData, setLocationData] = useState({
    latitude: '',
    longitude: '',
    speed: ''
  });

  useEffect(() => {
    fetchBuses();
  }, []);

  useEffect(() => {
    let interval;
    if (selectedBus) {
      interval = setInterval(() => {
        fetchBusLocation(selectedBus._id);
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [selectedBus]);

  const fetchBuses = async () => {
    try {
      setLoading(true);
      const response = await getBuses({ status: filterStatus });
      const busesData = response?.data?.buses;
      if (!Array.isArray(busesData)) {
        throw new Error('Invalid bus response');
      }
      setBuses(busesData);
      setLoadError('');
    } catch (error) {
      console.error('Error fetching buses:', error);
      toast.error('Failed to fetch buses');
      setLoadError('Unable to load live bus data from the backend API.');
      setBuses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusLocation = async (busId) => {
    try {
      const response = await getBusLocation(busId);
      if (response?.data?.bus) {
        setSelectedBus(prev => ({
          ...prev,
          gpsLocation: response.data.bus.gpsLocation
        }));
      }
    } catch (error) {
      console.error('Failed to fetch location');
    }
  };

  useEffect(() => {
    fetchBuses();
  }, [filterStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBus) {
        await updateBus(editingBus._id, formData);
        toast.success('Bus updated successfully');
      } else {
        await createBus(formData);
        toast.success('Bus created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchBuses();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to remove this bus?')) return;
    try {
      await deleteBus(id);
      toast.success('Bus removed successfully');
      fetchBuses();
    } catch (error) {
      toast.error('Failed to remove bus');
    }
  };

  const handleUpdateLocation = async (e) => {
    e.preventDefault();
    try {
      await updateBusLocation(selectedBus._id, {
        latitude: parseFloat(locationData.latitude),
        longitude: parseFloat(locationData.longitude),
        speed: parseFloat(locationData.speed) || 0
      });
      toast.success('Location updated successfully');
      setShowLocationModal(false);
      fetchBusLocation(selectedBus._id);
    } catch (error) {
      toast.error('Failed to update location');
    }
  };

  const resetForm = () => {
    setFormData({
      busNumber: '',
      registrationNumber: '',
      driverName: '',
      driverPhone: '',
      driverLicense: '',
      routeName: '',
      routeStops: [],
      capacity: 50,
      currentStatus: 'Active'
    });
    setEditingBus(null);
  };

  const openEditModal = (bus) => {
    setEditingBus(bus);
    setFormData({
      busNumber: bus.busNumber || '',
      registrationNumber: bus.registrationNumber || '',
      driverName: bus.driverName || '',
      driverPhone: bus.driverPhone || '',
      driverLicense: bus.driverLicense || '',
      routeName: bus.routeName || '',
      routeStops: bus.routeStops || [],
      capacity: bus.capacity || 50,
      currentStatus: bus.currentStatus || 'Active'
    });
    setShowModal(true);
  };

  const openLocationModal = (bus) => {
    setSelectedBus(bus);
    setLocationData({
      latitude: bus.gpsLocation?.latitude?.toString() || '',
      longitude: bus.gpsLocation?.longitude?.toString() || '',
      speed: bus.gpsLocation?.speed?.toString() || ''
    });
    setShowLocationModal(true);
  };

  const handleSelectBus = (bus) => {
    setSelectedBus(bus);
    if (bus.gpsLocation?.latitude && bus.gpsLocation?.longitude) {
      setMapCenter([bus.gpsLocation.latitude, bus.gpsLocation.longitude]);
    }
    fetchBusLocation(bus._id);
  };

  const getStatusBadge = (status) => {
    const styles = {
      Active: 'bg-green-100 text-green-800',
      Inactive: 'bg-gray-100 text-gray-800',
      Maintenance: 'bg-yellow-100 text-yellow-800',
      'On Route': 'bg-blue-100 text-blue-800',
      Idle: 'bg-purple-100 text-purple-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const columns = [
    { key: 'busNumber', header: 'Bus No', width: '100px' },
    { key: 'registrationNumber', header: 'Registration' },
    { 
      key: 'driverName', 
      header: 'Driver',
      render: (row) => (
        <div>
          <p className="font-medium">{row.driverName}</p>
          <p className="text-xs text-gray-500">{row.driverPhone}</p>
        </div>
      )
    },
    { key: 'routeName', header: 'Route' },
    { 
      key: 'capacity', 
      header: 'Students',
      render: (row) => `${row.assignedStudents?.length || 0}/${row.capacity}`
    },
    { 
      key: 'currentStatus', 
      header: 'Status',
      render: (row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(row.currentStatus)}`}>
          {row.currentStatus}
        </span>
      )
    },
    { 
      key: 'actions', 
      header: 'Actions',
      width: '150px',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleSelectBus(row)}
            className={`p-1.5 rounded ${selectedBus?._id === row._id ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
            title="Track"
          >
            <Navigation className="w-4 h-4" />
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => openLocationModal(row)}
                className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                title="Update Location"
              >
                <MapPin className="w-4 h-4" />
              </button>
              <button
                onClick={() => openEditModal(row)}
                className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(row._id)}
                className="p-1.5 rounded hover:bg-red-50 text-red-600"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  const statusOptions = ['', 'Active', 'Inactive', 'Maintenance', 'On Route', 'Idle'];

  // Get markers for all buses with locations
  const busMarkers = buses.filter(b => b.gpsLocation?.latitude && b.gpsLocation?.longitude);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bus Tracking</h1>
        {isAdmin && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Bus
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loadError ? (
          <div className="lg:col-span-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}
        {/* Bus List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="">All Status</option>
              {statusOptions.filter(s => s).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <LoadingSpinner text="Loading buses..." />
          ) : buses.length === 0 ? (
            <EmptyState
              title="No Buses Found"
              description="There are no buses in the system. Add your first bus to start tracking."
              action={() => { resetForm(); setShowModal(true); }}
              actionLabel="Add Bus"
            />
          ) : (
            <DataTable
              columns={columns}
              data={buses}
              loading={loading}
            />
          )}
        </div>

        {/* Selected Bus Details */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="text-lg font-semibold mb-4">Bus Details</h2>
            
            {selectedBus ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Bus className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{selectedBus.busNumber}</p>
                      <p className="text-sm text-gray-500">{selectedBus.registrationNumber}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedBus.currentStatus)}`}>
                    {selectedBus.currentStatus}
                  </span>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-2">Driver Information</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span>{selectedBus.driverName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{selectedBus.driverPhone}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-2">Route Information</h3>
                  <div className="flex items-center gap-2">
                    <Route className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{selectedBus.routeName}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedBus.assignedStudents?.length || 0} students assigned
                  </p>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-2">Live Location</h3>
                  {selectedBus.gpsLocation?.latitude ? (
                    <div className="space-y-2 text-sm">
                      <p>Lat: {selectedBus.gpsLocation.latitude.toFixed(6)}</p>
                      <p>Lng: {selectedBus.gpsLocation.longitude.toFixed(6)}</p>
                      <p>Speed: {selectedBus.gpsLocation.speed || 0} km/h</p>
                      <p className="text-gray-500">
                        Last updated: {new Date(selectedBus.gpsLocation.lastUpdated).toLocaleString()}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500">Location not available</p>
                  )}
                </div>

                {selectedBus.assignedStudents?.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-2">Assigned Students</h3>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedBus.assignedStudents.map((student, idx) => (
                        <div key={idx} className="text-sm flex justify-between p-2 bg-gray-50 rounded">
                          <span>{student.studentId?.fullName}</span>
                          <span className="text-gray-500">{student.stopName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Select a bus to view details</p>
              </div>
            )}
          </div>

          {/* Live Map */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Live Map</h2>
            </div>
            <div className="h-80">
              <MapContainer 
                center={mapCenter} 
                zoom={13} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapUpdater center={selectedBus?.gpsLocation ? { lat: selectedBus.gpsLocation.latitude, lng: selectedBus.gpsLocation.longitude } : null} />
                
                {busMarkers.map((bus) => (
                  <Marker 
                    key={bus._id}
                    position={[bus.gpsLocation.latitude, bus.gpsLocation.longitude]}
                    icon={busIcon}
                  >
                    <Popup>
                      <div className="p-2">
                        <h3 className="font-semibold">{bus.busNumber}</h3>
                        <p className="text-sm">Driver: {bus.driverName}</p>
                        <p className="text-sm">Route: {bus.routeName}</p>
                        <p className="text-sm">Status: {bus.currentStatus}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Bus Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingBus ? 'Edit Bus' : 'Add New Bus'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bus Number *</label>
              <input
                type="text"
                required
                value={formData.busNumber}
                onChange={(e) => setFormData({ ...formData, busNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                placeholder="e.g., BUS-01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number *</label>
              <input
                type="text"
                required
                value={formData.registrationNumber}
                onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name *</label>
              <input
                type="text"
                required
                value={formData.driverName}
                onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver Phone *</label>
              <input
                type="tel"
                required
                value={formData.driverPhone}
                onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver License</label>
              <input
                type="text"
                value={formData.driverLicense}
                onChange={(e) => setFormData({ ...formData, driverLicense: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Route Name *</label>
              <input
                type="text"
                required
                value={formData.routeName}
                onChange={(e) => setFormData({ ...formData, routeName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                placeholder="e.g., Route A - City Center"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.currentStatus}
                onChange={(e) => setFormData({ ...formData, currentStatus: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Maintenance">Maintenance</option>
                <option value="On Route">On Route</option>
                <option value="Idle">Idle</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
            >
              {editingBus ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Update Location Modal */}
      <Modal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        title="Update Bus Location"
        size="md"
      >
        <form onSubmit={handleUpdateLocation} className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-blue-800">Bus: {selectedBus?.busNumber}</p>
            <p className="text-sm text-blue-800">Route: {selectedBus?.routeName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Latitude *</label>
            <input
              type="number"
              step="0.000001"
              required
              value={locationData.latitude}
              onChange={(e) => setLocationData({ ...locationData, latitude: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Longitude *</label>
            <input
              type="number"
              step="0.000001"
              required
              value={locationData.longitude}
              onChange={(e) => setLocationData({ ...locationData, longitude: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Speed (km/h)</label>
            <input
              type="number"
              value={locationData.speed}
              onChange={(e) => setLocationData({ ...locationData, speed: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowLocationModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Update Location
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default BusTracking;

