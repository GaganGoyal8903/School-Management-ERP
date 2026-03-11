const express = require('express');
const router = express.Router();
const { 
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
} = require('../controllers/busController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Protected routes
router.use(protect);

// Get bus statistics
router.get('/stats', authorize('admin'), getBusStats);

// Get live location
router.get('/:id/location', getBusLocation);

// Assign/remove students
router.post('/:id/students', authorize('admin'), assignStudent);
router.delete('/:id/students/:studentId', authorize('admin'), removeStudent);

// Update GPS location
router.put('/:id/location', protect, updateLocation);

// CRUD operations
router.route('/')
  .get(getBuses)
  .post(authorize('admin'), createBus);

router.route('/:id')
  .get(getBusById)
  .put(authorize('admin'), updateBus)
  .delete(authorize('admin'), deleteBus);

module.exports = router;

