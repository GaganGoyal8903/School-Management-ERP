const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  getBusList,
  getBusRecordById,
  createBusRecord,
  updateBusRecord,
  updateBusLocationRecord,
  assignStudentToBusRecord,
  removeStudentFromBusRecord,
  deleteBusRecord,
  getBusStatistics,
} = require('../services/busSqlService');

const getBuses = asyncHandler(async (req, res) => {
  const buses = await getBusList({
    status: req.query.status,
    routeName: req.query.routeName,
  });

  res.status(200).json({ success: true, buses, data: buses });
});

const getBusById = asyncHandler(async (req, res) => {
  const bus = await getBusRecordById(req.params.id);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  res.status(200).json({ success: true, bus, data: bus });
});

const createBus = asyncHandler(async (req, res) => {
  const bus = await createBusRecord(req.body);
  res.status(201).json({ success: true, bus, data: bus });
});

const updateBus = asyncHandler(async (req, res) => {
  const bus = await updateBusRecord(req.params.id, req.body);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  res.status(200).json({ success: true, bus, data: bus });
});

const updateLocation = asyncHandler(async (req, res) => {
  const bus = await updateBusLocationRecord(req.params.id, req.body);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  res.status(200).json({
    success: true,
    bus: {
      latitude: bus.gpsLocation.latitude,
      longitude: bus.gpsLocation.longitude,
      lastUpdated: bus.gpsLocation.lastUpdated,
      speed: bus.gpsLocation.speed,
    },
    data: {
      latitude: bus.gpsLocation.latitude,
      longitude: bus.gpsLocation.longitude,
      lastUpdated: bus.gpsLocation.lastUpdated,
      speed: bus.gpsLocation.speed,
    },
  });
});

const getBusLocation = asyncHandler(async (req, res) => {
  const bus = await getBusRecordById(req.params.id);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  res.status(200).json({ success: true, bus, data: bus });
});

const assignStudent = asyncHandler(async (req, res) => {
  const result = await assignStudentToBusRecord(req.params.id, req.body);

  if (result?.resultCode === 'not_found') {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  if (result?.resultCode === 'already_assigned') {
    return res.status(400).json({ success: false, message: 'Student already assigned to this bus' });
  }

  if (result?.resultCode === 'full') {
    return res.status(400).json({ success: false, message: 'Bus is at full capacity' });
  }

  if (result?.resultCode === 'invalid_payload') {
    return res.status(400).json({ success: false, message: 'Please provide a valid student assignment' });
  }

  res.status(200).json({ success: true, bus: result.bus, data: result.bus });
});

const removeStudent = asyncHandler(async (req, res) => {
  const result = await removeStudentFromBusRecord(req.params.id, req.params.studentId);
  res.status(200).json({ success: true, data: result.bus });
});

const deleteBus = asyncHandler(async (req, res) => {
  const result = await deleteBusRecord(req.params.id);

  if (result?.resultCode === 'not_found') {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  res.status(200).json({ success: true, message: 'Bus removed successfully' });
});

const getBusStats = asyncHandler(async (req, res) => {
  const stats = await getBusStatistics();
  res.status(200).json({ success: true, data: stats });
});

module.exports = {
  getBuses,
  getBusById,
  createBus,
  updateBus,
  updateLocation,
  getBusLocation,
  assignStudent,
  removeStudent,
  deleteBus,
  getBusStats,
};
