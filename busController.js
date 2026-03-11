const Bus = require('../models/Bus');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Get all buses
// @route   GET /api/buses
// @access  Private
const getBuses = asyncHandler(async (req, res) => {
  const { status, routeName } = req.query;
  
  const query = {};
  if (status) query.currentStatus = status;
  if (routeName) query.routeName = routeName;
  query.isActive = true;

  const buses = await Bus.find(query)
    .populate('assignedStudents.studentId', 'fullName class section')
    .sort({ busNumber: 1 });

  res.status(200).json({ success: true, data: buses });
});

// @desc    Get single bus by ID
// @route   GET /api/buses/:id
// @access  Private
const getBusById = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id)
    .populate('assignedStudents.studentId', 'fullName class section rollNumber guardianName guardianPhone');

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  res.status(200).json({ success: true, data: bus });
});

// @desc    Create new bus
// @route   POST /api/buses
// @access  Private (Admin)
const createBus = asyncHandler(async (req, res) => {
  const bus = await Bus.create(req.body);

  res.status(201).json({ success: true, data: bus });
});

// @desc    Update bus
// @route   PUT /api/buses/:id
// @access  Private (Admin)
const updateBus = asyncHandler(async (req, res) => {
  let bus = await Bus.findById(req.params.id);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  bus = await Bus.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.status(200).json({ success: true, data: bus });
});

// @desc    Update GPS location
// @route   PUT /api/buses/:id/location
// @access  Private (Driver/Admin)
const updateLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude, speed } = req.body;

  const bus = await Bus.findById(req.params.id);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  bus.gpsLocation = {
    latitude,
    longitude,
    lastUpdated: new Date(),
    speed: speed || 0
  };

  await bus.save();

  res.status(200).json({ 
    success: true, 
    data: {
      latitude: bus.gpsLocation.latitude,
      longitude: bus.gpsLocation.longitude,
      lastUpdated: bus.gpsLocation.lastUpdated
    }
  });
});

// @desc    Get live bus location
// @route   GET /api/buses/:id/location
// @access  Private
const getBusLocation = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id).select('busNumber gpsLocation currentStatus routeName');

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  res.status(200).json({ success: true, data: bus });
});

// @desc    Assign student to bus
// @route   POST /api/buses/:id/students
// @access  Private (Admin)
const assignStudent = asyncHandler(async (req, res) => {
  const { studentId, stopName } = req.body;

  const bus = await Bus.findById(req.params.id);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  // Check if already assigned
  const alreadyAssigned = bus.assignedStudents.find(
    s => s.studentId.toString() === studentId
  );

  if (alreadyAssigned) {
    return res.status(400).json({ 
      success: false, 
      message: 'Student already assigned to this bus' 
    });
  }

  // Check capacity
  if (bus.assignedStudents.length >= bus.capacity) {
    return res.status(400).json({ 
      success: false, 
      message: 'Bus is at full capacity' 
    });
  }

  bus.assignedStudents.push({ studentId, stopName });
  await bus.save();

  res.status(200).json({ success: true, data: bus });
});

// @desc    Remove student from bus
// @route   DELETE /api/buses/:id/students/:studentId
// @access  Private (Admin)
const removeStudent = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  bus.assignedStudents = bus.assignedStudents.filter(
    s => s.studentId.toString() !== req.params.studentId
  );

  await bus.save();

  res.status(200).json({ success: true, data: bus });
});

// @desc    Delete bus
// @route   DELETE /api/buses/:id
// @access  Private (Admin)
const deleteBus = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id);

  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  // Soft delete - just mark as inactive
  bus.isActive = false;
  await bus.save();

  res.status(200).json({ success: true, message: 'Bus removed successfully' });
});

// @desc    Get bus statistics
// @route   GET /api/buses/stats
// @access  Private (Admin)
const getBusStats = asyncHandler(async (req, res) => {
  const totalBuses = await Bus.countDocuments({ isActive: true });
  
  const statusCounts = await Bus.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$currentStatus',
        count: { $sum: 1 }
      }
    }
  ]);

  const totalStudents = await Bus.aggregate([
    { $match: { isActive: true } },
    { $unwind: '$assignedStudents' },
    { $count: 'totalStudents' }
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalBuses,
      byStatus: statusCounts,
      totalStudentsAssigned: totalStudents[0]?.totalStudents || 0
    }
  });
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
  getBusStats
};

