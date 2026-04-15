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
router.get('/student/:studentId', authorize('admin', 'teacher', 'accountant', 'student'), getFeesByStudent);

// Get fee statistics
router.get('/stats', authorize('admin', 'accountant'), getFeeStats);

// Bulk create fees
router.post('/bulk', authorize('admin'), bulkCreateFees);

// Collect payment
router.post('/:id/pay', authorize('admin', 'accountant', 'student'), collectPayment);

// CRUD operations
router.route('/')
  .get(authorize('admin', 'teacher', 'accountant'), getFees)
  .post(authorize('admin'), createFee);

router.route('/:id')
  .get(authorize('admin', 'teacher', 'accountant'), getFeeById)
  .put(authorize('admin'), updateFee)
  .delete(authorize('admin'), deleteFee);

module.exports = router;

