const express = require('express');
const router = express.Router();
const { 
  getFees, 
  getFeeById, 
  getFeesByStudent, 
  createFee, 
  updateFee, 
  collectPayment,
  deleteFee,
  getFeeStats,
  bulkCreateFees
} = require('../controllers/feeController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Public routes - none

// Protected routes
router.use(protect);

// Get fees by student
router.get('/student/:studentId', getFeesByStudent);

// Get fee statistics
router.get('/stats', authorize('admin'), getFeeStats);

// Bulk create fees
router.post('/bulk', authorize('admin'), bulkCreateFees);

// Collect payment
router.post('/:id/pay', authorize('admin'), collectPayment);

// CRUD operations
router.route('/')
  .get(getFees)
  .post(authorize('admin'), createFee);

router.route('/:id')
  .get(getFeeById)
  .put(authorize('admin'), updateFee)
  .delete(authorize('admin'), deleteFee);

module.exports = router;

